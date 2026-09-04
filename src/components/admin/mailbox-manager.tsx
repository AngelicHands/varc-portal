"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminJobsPagination } from "@/components/admin/admin-jobs-pagination";
import { notifyAction } from "@/components/admin/admin-toast";
import { useConfirm } from "@/components/admin/use-confirm";
import {
  ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  type AdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";
import {
  emailJobKindLabel,
  type AdminEmailJob,
} from "@/lib/mail/job-types";
import type { EmailJobsPage } from "@/lib/mail/jobs";
import type { MailMessagesPage } from "@/lib/mail/mailbox";
import type { AdminMailMessageListItem } from "@/lib/mail/mailbox-types";

type MailboxCounts = {
  queued: number;
  running: number;
  failed: number;
};

type Props = {
  initialJobsPage: EmailJobsPage;
  initialMessagesPage: MailMessagesPage;
  initialCounts: MailboxCounts;
};

type MailboxPayload = {
  jobs?: EmailJobsPage;
  messages?: MailMessagesPage;
  counts?: MailboxCounts;
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN");
}

function jobStatusClass(status: string) {
  if (status === "succeeded") return "text-green-700";
  if (status === "failed") return "text-red-700";
  if (status === "cancelled") return "text-gray-500";
  if (status === "running") return "text-amber-700";
  return "text-gray-600";
}

function messageStatusClass(status: string) {
  if (status === "sent") return "text-green-700";
  if (status === "failed") return "text-red-700";
  return "text-gray-500";
}

async function readJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as {
      error?: string;
      job?: AdminEmailJob;
      ok?: boolean;
    };
  }
  const text = (await response.text()).trim();
  return { error: text || undefined };
}

function mailboxQuery(params: {
  jobsPage: number;
  jobsPageSize: number;
  messagesPage: number;
  messagesPageSize: number;
}) {
  const search = new URLSearchParams({
    jobsPage: String(params.jobsPage),
    jobsPageSize: String(params.jobsPageSize),
    messagesPage: String(params.messagesPage),
    messagesPageSize: String(params.messagesPageSize),
  });
  return `/api/admin/mailbox?${search.toString()}`;
}

export function MailboxManager({
  initialJobsPage,
  initialMessagesPage,
  initialCounts,
}: Props) {
  const { ask, modal } = useConfirm();

  const [jobsPage, setJobsPage] = useState(initialJobsPage.page);
  const [jobsPageSize, setJobsPageSize] = useState<AdminJobsPageSize>(
    (initialJobsPage.pageSize as AdminJobsPageSize) ||
      ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  );
  const [jobs, setJobs] = useState(initialJobsPage.jobs);
  const [jobsTotal, setJobsTotal] = useState(initialJobsPage.total);
  const [jobsTotalPages, setJobsTotalPages] = useState(
    initialJobsPage.totalPages,
  );

  const [messagesPage, setMessagesPage] = useState(initialMessagesPage.page);
  const [messagesPageSize, setMessagesPageSize] = useState<AdminJobsPageSize>(
    (initialMessagesPage.pageSize as AdminJobsPageSize) ||
      ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  );
  const [messages, setMessages] = useState(initialMessagesPage.messages);
  const [messagesTotal, setMessagesTotal] = useState(initialMessagesPage.total);
  const [messagesTotalPages, setMessagesTotalPages] = useState(
    initialMessagesPage.totalPages,
  );

  const [counts, setCounts] = useState(initialCounts);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const applyPayload = useCallback((payload: MailboxPayload) => {
    if (payload.jobs) {
      setJobs(payload.jobs.jobs);
      setJobsTotal(payload.jobs.total);
      setJobsPage(payload.jobs.page);
      setJobsPageSize(
        (payload.jobs.pageSize as AdminJobsPageSize) ||
          ADMIN_JOBS_DEFAULT_PAGE_SIZE,
      );
      setJobsTotalPages(payload.jobs.totalPages);
    }
    if (payload.messages) {
      setMessages(payload.messages.messages);
      setMessagesTotal(payload.messages.total);
      setMessagesPage(payload.messages.page);
      setMessagesPageSize(
        (payload.messages.pageSize as AdminJobsPageSize) ||
          ADMIN_JOBS_DEFAULT_PAGE_SIZE,
      );
      setMessagesTotalPages(payload.messages.totalPages);
    }
    if (payload.counts) setCounts(payload.counts);
  }, []);

  const refresh = useCallback(
    async (opts?: {
      jobsPage?: number;
      jobsPageSize?: number;
      messagesPage?: number;
      messagesPageSize?: number;
    }) => {
      const nextJobsPage = opts?.jobsPage ?? jobsPage;
      const nextJobsPageSize = opts?.jobsPageSize ?? jobsPageSize;
      const nextMessagesPage = opts?.messagesPage ?? messagesPage;
      const nextMessagesPageSize = opts?.messagesPageSize ?? messagesPageSize;
      const response = await fetch(
        mailboxQuery({
          jobsPage: nextJobsPage,
          jobsPageSize: nextJobsPageSize,
          messagesPage: nextMessagesPage,
          messagesPageSize: nextMessagesPageSize,
        }),
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as MailboxPayload;
      applyPayload(payload);
    },
    [applyPayload, jobsPage, jobsPageSize, messagesPage, messagesPageSize],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function replaceJob(nextJob: AdminEmailJob) {
    setJobs((current) =>
      current.map((job) => (job.id === nextJob.id ? nextJob : job)),
    );
  }

  async function runJobAction(
    id: string,
    action: "resend" | "cancel" | "delete",
  ) {
    setPendingKey(`job:${id}:${action}`);
    try {
      if (action === "delete") {
        const response = await fetch(`/api/admin/email/jobs/${id}`, {
          method: "DELETE",
        });
        const payload = await readJson(response);
        if (!response.ok) {
          notifyAction(
            { ok: false, error: payload.error || "Delete failed" },
            "",
          );
          return;
        }
        notifyAction({ ok: true }, "Email job deleted");
        const nextPage =
          jobs.length <= 1 && jobsPage > 1
            ? Math.max(1, jobsPage - 1)
            : jobsPage;
        await refresh({ jobsPage: nextPage });
        return;
      }

      const response = await fetch(`/api/admin/email/jobs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await readJson(response);
      if (!response.ok || !payload.job) {
        notifyAction(
          { ok: false, error: payload.error || "Action failed" },
          "",
        );
        return;
      }
      replaceJob(payload.job);
      notifyAction(
        { ok: true },
        action === "resend"
          ? "Email job requeued for sending"
          : "Email job cancelled",
      );
      await refresh();
    } finally {
      setPendingKey(null);
    }
  }

  async function runMessageAction(
    id: string,
    action: "resend" | "delete",
  ) {
    setPendingKey(`message:${id}:${action}`);
    try {
      if (action === "delete") {
        const response = await fetch(`/api/admin/mailbox/messages/${id}`, {
          method: "DELETE",
        });
        const payload = await readJson(response);
        if (!response.ok) {
          notifyAction(
            { ok: false, error: payload.error || "Delete failed" },
            "",
          );
          return;
        }
        notifyAction({ ok: true }, "Outbox message deleted");
        const nextPage =
          messages.length <= 1 && messagesPage > 1
            ? Math.max(1, messagesPage - 1)
            : messagesPage;
        await refresh({ messagesPage: nextPage });
        return;
      }

      const response = await fetch(`/api/admin/mailbox/messages/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      });
      const payload = await readJson(response);
      if (!response.ok || !payload.job) {
        notifyAction(
          { ok: false, error: payload.error || "Resend failed" },
          "",
        );
        return;
      }
      notifyAction({ ok: true }, "Failed message requeued for sending");
      await refresh({ jobsPage: 1 });
    } finally {
      setPendingKey(null);
    }
  }

  function isPending(key: string) {
    return pendingKey === key;
  }

  async function onDeleteJob(id: string) {
    const confirmed = await ask({
      title: "Delete email job?",
      message: "This job will be removed from the queue.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    await runJobAction(id, "delete");
  }

  async function onDeleteMessage(id: string) {
    const confirmed = await ask({
      title: "Delete outbox message?",
      message: "This message will be permanently removed.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    await runMessageAction(id, "delete");
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Queued</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {counts.queued}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Running</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">
            {counts.running}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Failed</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">
            {counts.failed}
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Email queue</h2>
          <p className="mt-1 text-sm text-gray-600">
            Background jobs waiting to send or recently failed.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">To</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-600"
                  >
                    No pending email jobs.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(job.createdAt)}
                    </td>
                    <td className={`px-4 py-3 ${jobStatusClass(job.status)}`}>
                      {job.status}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {emailJobKindLabel(job.kind)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{job.to}</td>
                    <td className="px-4 py-3 text-gray-900">
                      <span className="line-clamp-1">{job.subject}</span>
                      {job.error ? (
                        <span className="mt-1 block text-xs text-red-600">
                          {job.error}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {job.attempts}/{job.maxAttempts}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {job.status === "failed" ? (
                          <button
                            type="button"
                            disabled={isPending(`job:${job.id}:resend`)}
                            onClick={() => runJobAction(job.id, "resend")}
                            className="text-sm font-medium text-accent hover:underline disabled:opacity-50"
                          >
                            Resend
                          </button>
                        ) : null}
                        {job.status === "queued" || job.status === "running" ? (
                          <button
                            type="button"
                            disabled={isPending(`job:${job.id}:cancel`)}
                            onClick={() => runJobAction(job.id, "cancel")}
                            className="text-sm font-medium text-amber-700 hover:underline disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        ) : null}
                        {job.status !== "running" ? (
                          <button
                            type="button"
                            disabled={isPending(`job:${job.id}:delete`)}
                            onClick={() => void onDeleteJob(job.id)}
                            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <AdminJobsPagination
            page={jobsPage}
            pageSize={jobsPageSize}
            total={jobsTotal}
            totalPages={jobsTotalPages}
            label="Email queue"
            onPageChange={(next) => {
              setJobsPage(next);
              void refresh({ jobsPage: next });
            }}
            onPageSizeChange={(nextSize) => {
              setJobsPageSize(nextSize);
              setJobsPage(1);
              void refresh({ jobsPage: 1, jobsPageSize: nextSize });
            }}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Outbox</h2>
          <p className="mt-1 text-sm text-gray-600">
            Delivered or failed messages recorded after send attempts.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">To</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-600"
                  >
                    No messages sent yet.
                  </td>
                </tr>
              ) : (
                messages.map((message: AdminMailMessageListItem) => (
                  <tr key={message.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(message.createdAt)}
                    </td>
                    <td
                      className={`px-4 py-3 ${messageStatusClass(message.status)}`}
                    >
                      {message.status}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {emailJobKindLabel(message.kind)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{message.to}</td>
                    <td className="px-4 py-3 text-gray-900">
                      <span className="line-clamp-1">{message.subject}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/mailbox/${message.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          View
                        </Link>
                        {message.status === "failed" ? (
                          <button
                            type="button"
                            disabled={isPending(
                              `message:${message.id}:resend`,
                            )}
                            onClick={() =>
                              runMessageAction(message.id, "resend")
                            }
                            className="text-sm font-medium text-accent hover:underline disabled:opacity-50"
                          >
                            Resend
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={isPending(`message:${message.id}:delete`)}
                          onClick={() => void onDeleteMessage(message.id)}
                          className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <AdminJobsPagination
            page={messagesPage}
            pageSize={messagesPageSize}
            total={messagesTotal}
            totalPages={messagesTotalPages}
            label="Outbox"
            onPageChange={(next) => {
              setMessagesPage(next);
              void refresh({ messagesPage: next });
            }}
            onPageSizeChange={(nextSize) => {
              setMessagesPageSize(nextSize);
              setMessagesPage(1);
              void refresh({
                messagesPage: 1,
                messagesPageSize: nextSize,
              });
            }}
          />
        </div>
      </section>

      {modal}
    </div>
  );
}
