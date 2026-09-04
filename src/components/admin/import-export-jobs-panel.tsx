"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AdminJobsPagination } from "@/components/admin/admin-jobs-pagination";
import { notifyAction } from "@/components/admin/admin-toast";
import { AlertIcon, TrashIcon } from "@/components/admin/admin-action-icons";
import { IconActionButton } from "@/components/admin/icon-action-button";
import { JobErrorModal } from "@/components/admin/job-error-modal";
import { useImportExportJobsStream } from "@/components/admin/use-import-export-jobs-stream";
import { useConfirm } from "@/components/admin/use-confirm";
import type { AdminImportExportJob } from "@/lib/import-export/jobs-shared";
import {
  IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
  type ImportExportJobsPage,
  type ImportExportJobsPageSize,
} from "@/lib/import-export/jobs-shared";

type SettingsSummary = {
  source: string;
  isConfigured: boolean;
  isVerified: boolean;
  repoUrl: string;
  branch: string;
  syncRoot: string;
};

type Props = {
  kind: "import" | "export";
  settings: SettingsSummary;
  initialPage: ImportExportJobsPage;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN");
}

function statusClass(status: string) {
  if (status === "succeeded") return "text-green-700";
  if (status === "failed") return "text-red-700";
  if (status === "cancelled") return "text-gray-500";
  if (status === "running") return "text-amber-700";
  return "text-gray-600";
}

function triggerLabel(trigger: string) {
  return trigger === "scheduled" ? "Scheduled" : "Manual";
}

async function readPayload(
  response: Response,
): Promise<{ error?: string; job?: AdminImportExportJob }> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as {
      error?: string;
      job?: AdminImportExportJob;
    };
  }
  const text = (await response.text()).trim();
  return { error: text || undefined };
}

export function ImportExportJobsPanel({ kind, settings, initialPage }: Props) {
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState<ImportExportJobsPageSize>(
    (initialPage.pageSize as ImportExportJobsPageSize) ||
      IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
  );
  const { jobs, total, totalPages, setData } = useImportExportJobsStream(
    kind,
    initialPage,
    page,
    pageSize,
  );
  const [pending, setPending] = useState(false);
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const { ask, modal } = useConfirm();

  const canRun =
    settings.source === "github" && settings.isConfigured && settings.isVerified;

  const hasActive = useMemo(
    () => jobs.some((job) => job.status === "queued" || job.status === "running"),
    [jobs],
  );

  async function onRunJob() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/admin/import-export/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        setError(payload.error ?? `Failed to queue ${kind} job`);
        return;
      }
      if (payload.job && page === 1) {
        setData((current) => ({
          ...current,
          jobs: [
            payload.job!,
            ...current.jobs.filter((job) => job.id !== payload.job!.id),
          ].slice(0, pageSize),
          total: current.total + 1,
        }));
      }
      notifyAction(
        { ok: true },
        kind === "import" ? "Import job queued" : "Export job queued",
      );
    } finally {
      setPending(false);
    }
  }

  async function confirmDeleteJob(job: AdminImportExportJob) {
    const jobLabel = kind === "import" ? "import job" : "export job";
    const confirmed = await ask({
      title: `Delete ${jobLabel}?`,
      message: `Remove this ${triggerLabel(job.trigger).toLowerCase()} ${jobLabel} from ${formatDate(job.createdAt)}? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    setActionJobId(job.id);
    try {
      await deleteJob(job.id);
    } finally {
      setActionJobId(null);
    }
  }

  async function confirmDeleteAllJobs() {
    const jobLabel = kind === "import" ? "import jobs" : "export jobs";
    const confirmed = await ask({
      title: `Delete all ${jobLabel}?`,
      message: `Remove every ${jobLabel} except any currently running. This cannot be undone.`,
      confirmLabel: "Delete all",
      variant: "danger",
    });
    if (!confirmed) return;

    setPending(true);
    try {
      await deleteAllJobs();
    } finally {
      setPending(false);
    }
  }

  async function deleteAllJobs() {
    const response = await fetch(
      `/api/admin/import-export/jobs?kind=${encodeURIComponent(kind)}`,
      { method: "DELETE" },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      deletedCount?: number;
      keptRunning?: number;
    };
    if (!response.ok) {
      notifyAction(
        { ok: false, error: payload.error || "Failed to delete jobs" },
        "",
      );
      return;
    }

    setPage(1);
    setData((current) => ({
      ...current,
      jobs: current.jobs.filter((job) => job.status === "running"),
      total: payload.keptRunning ?? 0,
      page: 1,
      totalPages: 1,
    }));

    const deleted = payload.deletedCount ?? 0;
    const kept = payload.keptRunning ?? 0;
    notifyAction(
      { ok: true },
      kept > 0
        ? `Deleted ${deleted} job${deleted === 1 ? "" : "s"}; ${kept} running job${kept === 1 ? "" : "s"} kept`
        : `Deleted ${deleted} job${deleted === 1 ? "" : "s"}`,
    );
  }

  async function deleteJob(jobId: string) {
    const response = await fetch(`/api/admin/import-export/jobs/${jobId}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      notifyAction(
        { ok: false, error: payload.error || "Failed to delete job" },
        "",
      );
      return;
    }
    if (jobs.length === 1 && page > 1) {
      setPage(page - 1);
    } else {
      setData((current) => ({
        ...current,
        jobs: current.jobs.filter((job) => job.id !== jobId),
        total: Math.max(0, current.total - 1),
        totalPages: Math.max(
          1,
          Math.ceil(Math.max(0, current.total - 1) / pageSize),
        ),
      }));
    }
    notifyAction({ ok: true }, "Job deleted");
  }

  const title = kind === "import" ? "Import jobs" : "Export jobs";
  const runLabel =
    pending ? "Queueing…" : hasActive ? "Job in progress…" : kind === "import" ? "Run import" : "Run export";
  const description =
    kind === "import"
      ? "Sync categories, articles, and media from GitHub into MongoDB."
      : "Commit CMS content from MongoDB to GitHub as Markdown.";

  return (
    <>
      <div className="mt-8">
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-600">{description}</p>
            {settings.isConfigured ? (
              <p className="mt-2 truncate font-mono text-xs text-gray-500">
                {settings.repoUrl || "—"}
                {settings.branch ? `@${settings.branch}` : ""}
                {settings.syncRoot ? ` · ${settings.syncRoot}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={total === 0 || pending}
              onClick={() => void confirmDeleteAllJobs()}
              className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Delete all
            </button>
            <button
              type="button"
              disabled={!canRun || pending || hasActive}
              onClick={() => void onRunJob()}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {runLabel}
            </button>
          </div>
        </div>

        {!settings.isConfigured ? (
          <p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            Configure {kind} on the{" "}
            <Link href="/admin/import-export" className="underline">
              Import/Export settings
            </Link>{" "}
            page first.
          </p>
        ) : null}

        {settings.isConfigured && !settings.isVerified ? (
          <p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            Verify the {kind} connection on the{" "}
            <Link href="/admin/import-export" className="underline">
              Import/Export settings
            </Link>{" "}
            page before running jobs.
          </p>
        ) : null}

        {settings.source !== "github" ? (
          <p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            Custom URL {kind} is not supported yet. Switch to GitHub in Settings.
          </p>
        ) : null}

        {error ? (
          <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {jobs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-600">No jobs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Trigger</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const failedMessage = job.error?.trim() || "";
                  const showErrorButton =
                    job.status === "failed" && Boolean(failedMessage);
                  return (
                  <tr key={job.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDate(job.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{triggerLabel(job.trigger)}</td>
                    <td className={`px-4 py-3 font-medium ${statusClass(job.status)}`}>
                      <div>{job.status}</div>
                      {job.phase ? (
                        <div className="text-xs font-normal text-gray-500">{job.phase}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{job.message || "—"}</div>
                      {showErrorButton ? (
                        <button
                          type="button"
                          onClick={() => setErrorDetail(failedMessage)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          <AlertIcon className="h-3.5 w-3.5" />
                          View error
                        </button>
                      ) : null}
                      {job.kind === "export" && job.htmlUrl ? (
                        <a
                          href={job.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs font-medium underline"
                        >
                          View commit
                        </a>
                      ) : null}
                      {job.stats ? (
                        <div className="mt-1 text-xs text-gray-500">
                          {Object.entries(job.stats)
                            .map(([entryKey, value]) => `${entryKey}: ${String(value)}`)
                            .join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{job.requestedByName || "—"}</div>
                      <div className="text-xs">{job.requestedByEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {job.status !== "running" ? (
                        <IconActionButton
                          label={
                            actionJobId === job.id ? "Deleting job" : "Delete job"
                          }
                          variant="danger"
                          disabled={actionJobId === job.id}
                          onClick={() => void confirmDeleteJob(job)}
                        >
                          <TrashIcon />
                        </IconActionButton>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <AdminJobsPagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          label={title}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
        />
      </section>
      </div>
      <JobErrorModal
        open={Boolean(errorDetail)}
        title={`${kind === "import" ? "Import" : "Export"} job error`}
        message={errorDetail || ""}
        onClose={() => setErrorDetail(null)}
      />
      {modal}
    </>
  );
}
