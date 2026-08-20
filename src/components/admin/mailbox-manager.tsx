"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { notifyAction } from "@/components/admin/admin-toast";
import { useConfirm } from "@/components/admin/use-confirm";
import {
  emailJobKindLabel,
  type AdminEmailJob,
} from "@/lib/mail/job-types";
import type { AdminMailMessageListItem } from "@/lib/mail/mailbox-types";

type Props = {
  initialJobs: AdminEmailJob[];
  initialMessages: AdminMailMessageListItem[];
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

export function MailboxManager({ initialJobs, initialMessages }: Props) {
  const { ask, modal } = useConfirm();
  const [jobs, setJobs] = useState(initialJobs);
  const [messages, setMessages] = useState(initialMessages);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/admin/mailbox", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          jobs?: AdminEmailJob[];
          messages?: AdminMailMessageListItem[];
        };
        if (payload.jobs) setJobs(payload.jobs);
        if (payload.messages) setMessages(payload.messages);
      } catch {
        // Ignore polling failures.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const queueCounts = useMemo(
    () => ({
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      failed:
        jobs.filter((job) => job.status === "failed").length +
        messages.filter((message) => message.status === "failed").length,
    }),
    [jobs, messages],
  );

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status !== "succeeded"),
    [jobs],
  );

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
        setJobs((current) => current.filter((job) => job.id !== id));
        notifyAction({ ok: true }, "Email job deleted");
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
        setMessages((current) =>
          current.filter((message) => message.id !== id),
        );
        notifyAction({ ok: true }, "Outbox message deleted");
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
      setJobs((current) => [payload.job!, ...current]);
      notifyAction({ ok: true }, "Failed message requeued for sending");
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
            {queueCounts.queued}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Running</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">
            {queueCounts.running}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Failed</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">
            {queueCounts.failed}
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

        {activeJobs.length === 0 ? (
          <p className="text-gray-600">No pending email jobs.</p>
        ) : (
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
                {activeJobs.map((job) => (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Outbox</h2>
          <p className="mt-1 text-sm text-gray-600">
            Delivered or failed messages recorded after send attempts.
          </p>
        </div>

        {messages.length === 0 ? (
          <p className="text-gray-600">No messages sent yet.</p>
        ) : (
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
                {messages.map((message) => (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal}
    </div>
  );
}
