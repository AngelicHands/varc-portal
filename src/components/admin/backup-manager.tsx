"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminJobsPagination } from "@/components/admin/admin-jobs-pagination";
import { notifyAction } from "@/components/admin/admin-toast";
import {
  ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  type AdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";
import type { AdminBackupJob, BackupJobsPage } from "@/lib/backup/jobs";

type Props = {
  view: "settings" | "jobs";
  initialJobsPage: BackupJobsPage;
  initialHasActive?: boolean;
  estimatedBytes: number;
  uniqueMediaFiles: number;
  uploadLimitBytes: number;
};

type JobsListPayload = BackupJobsPage & { hasActive?: boolean };

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

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

async function readActionPayload(response: Response): Promise<{ error?: string }> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as { error?: string };
  }
  const text = (await response.text()).trim();
  return { error: text || undefined };
}

function jobsQuery(page: number, pageSize: number) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return `/api/admin/backup/jobs?${params.toString()}`;
}

export function BackupManager({
  view,
  initialJobsPage,
  initialHasActive = false,
  estimatedBytes,
  uniqueMediaFiles,
  uploadLimitBytes,
}: Props) {
  const [page, setPage] = useState(initialJobsPage.page);
  const [pageSize, setPageSize] = useState<AdminJobsPageSize>(
    (initialJobsPage.pageSize as AdminJobsPageSize) ||
      ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  );
  const [jobs, setJobs] = useState(initialJobsPage.jobs);
  const [total, setTotal] = useState(initialJobsPage.total);
  const [totalPages, setTotalPages] = useState(initialJobsPage.totalPages);
  const [hasActive, setHasActive] = useState(initialHasActive);
  const [backupPending, setBackupPending] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"upload" | "remote">("upload");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const applyPage = useCallback((payload: JobsListPayload) => {
    setJobs(payload.jobs);
    setTotal(payload.total);
    setPage(payload.page);
    setPageSize(
      (payload.pageSize as AdminJobsPageSize) || ADMIN_JOBS_DEFAULT_PAGE_SIZE,
    );
    setTotalPages(payload.totalPages);
    if (typeof payload.hasActive === "boolean") {
      setHasActive(payload.hasActive);
    } else {
      setHasActive(
        payload.jobs.some(
          (job) => job.status === "queued" || job.status === "running",
        ),
      );
    }
  }, []);

  const refreshPage = useCallback(
    async (nextPage = page, nextPageSize = pageSize) => {
      const response = await fetch(jobsQuery(nextPage, nextPageSize), {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as JobsListPayload;
      applyPage(payload);
    },
    [applyPage, page, pageSize],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPage();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshPage]);

  function replaceJob(nextJob: AdminBackupJob) {
    setJobs((current) =>
      current.map((job) => (job.id === nextJob.id ? nextJob : job)),
    );
    if (nextJob.status === "queued" || nextJob.status === "running") {
      setHasActive(true);
    }
  }

  async function createBackup() {
    setBackupPending(true);
    try {
      const form = new FormData();
      form.set("kind", "backup");
      const response = await fetch("/api/admin/backup/jobs", {
        method: "POST",
        body: form,
      });
      const payload = (await readActionPayload(response)) as {
        error?: string;
        job?: AdminBackupJob;
      };
      if (!response.ok || !payload.job) {
        notifyAction(
          { ok: false, error: payload.error || "Failed to create backup job" },
          "",
        );
        return;
      }
      notifyAction({ ok: true }, "Backup job queued");
      setHasActive(true);
      if (view === "jobs") {
        setPage(1);
        await refreshPage(1, pageSize);
      }
    } finally {
      setBackupPending(false);
    }
  }

  async function createRestore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRestorePending(true);
    try {
      if (sourceType === "upload" && file && file.size > uploadLimitBytes) {
        notifyAction(
          {
            ok: false,
            error: `Backup ZIP is too large.\nChoose a file under ${formatBytes(uploadLimitBytes)} or use a remote link instead.`,
          },
          "",
        );
        return;
      }

      const form = new FormData();
      form.set("kind", "restore");
      form.set("sourceType", sourceType);
      form.set("confirmation", confirmation);
      if (sourceType === "remote") {
        form.set("remoteUrl", remoteUrl);
      } else if (file) {
        form.set("file", file);
      }

      const response = await fetch("/api/admin/backup/jobs", {
        method: "POST",
        body: form,
      });
      const payload = (await readActionPayload(response)) as {
        error?: string;
        job?: AdminBackupJob;
      };
      if (!response.ok || !payload.job) {
        const fallbackError =
          sourceType === "upload"
            ? `Failed to create restore job.\nIf this is an uploaded ZIP, make sure it is under ${formatBytes(uploadLimitBytes)} or use a remote link instead.`
            : "Failed to create restore job";
        notifyAction(
          { ok: false, error: payload.error || fallbackError },
          "",
        );
        return;
      }
      notifyAction({ ok: true }, "Restore job queued");
      setHasActive(true);
      setConfirmation("");
      setRemoteUrl("");
      setFile(null);
      const fileInput = document.getElementById("backup-restore-file") as
        | HTMLInputElement
        | null;
      if (fileInput) fileInput.value = "";
      if (view === "jobs") {
        setPage(1);
        await refreshPage(1, pageSize);
      }
    } finally {
      setRestorePending(false);
    }
  }

  async function cancelJob(jobId: string) {
    setActionJobId(jobId);
    try {
      const response = await fetch(`/api/admin/backup/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        job?: AdminBackupJob;
      };
      if (!response.ok || !payload.job) {
        notifyAction(
          { ok: false, error: payload.error || "Failed to cancel backup job" },
          "",
        );
        return;
      }
      replaceJob(payload.job);
      notifyAction({ ok: true }, "Job cancelled");
      await refreshPage();
    } finally {
      setActionJobId(null);
    }
  }

  async function deleteJob(jobId: string) {
    setActionJobId(jobId);
    try {
      const response = await fetch(`/api/admin/backup/jobs/${jobId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        notifyAction(
          { ok: false, error: payload.error || "Failed to delete backup job" },
          "",
        );
        return;
      }
      notifyAction({ ok: true }, "Job deleted");
      const nextPage =
        jobs.length <= 1 && page > 1 ? Math.max(1, page - 1) : page;
      setPage(nextPage);
      await refreshPage(nextPage, pageSize);
    } finally {
      setActionJobId(null);
    }
  }

  return (
    <div className="space-y-8">
      {view === "settings" ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Create Backup</h2>
            <p className="mt-1 text-sm text-gray-600">
              Queue a background job to archive MongoDB content and media files.
              The finished ZIP will be emailed to your admin address.
            </p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded border border-gray-200 px-3 py-2">
                <div className="text-gray-500">Estimated media size</div>
                <div className="mt-1 font-medium text-gray-900">
                  {formatBytes(estimatedBytes)}
                </div>
              </div>
              <div className="rounded border border-gray-200 px-3 py-2">
                <div className="text-gray-500">Managed files</div>
                <div className="mt-1 font-medium text-gray-900">
                  {uniqueMediaFiles}
                </div>
              </div>
              <div className="rounded border border-gray-200 px-3 py-2">
                <div className="text-gray-500">Upload limit</div>
                <div className="mt-1 font-medium text-gray-900">
                  {formatBytes(uploadLimitBytes)}
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                disabled={backupPending || hasActive}
                onClick={() => void createBackup()}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
              >
                {backupPending ? "Queueing…" : "Create backup"}
              </button>
              <p className="text-sm text-gray-500">
                {hasActive
                  ? "Another backup or restore job is already active."
                  : "One job runs at a time."}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Restore Backup</h2>
            <p className="mt-1 text-sm text-gray-600">
              Replace current MongoDB content and managed files from an uploaded
              ZIP or a remote HTTPS link.
            </p>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => void createRestore(event)}
            >
              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setSourceType("upload")}
                  className={`rounded border px-3 py-1.5 ${sourceType === "upload" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700"}`}
                >
                  Upload file
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType("remote")}
                  className={`rounded border px-3 py-1.5 ${sourceType === "remote" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700"}`}
                >
                  Remote link
                </button>
              </div>

              {sourceType === "upload" ? (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Backup ZIP</span>
                  <input
                    id="backup-restore-file"
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(event) =>
                      setFile(event.currentTarget.files?.[0] ?? null)
                    }
                    className="w-full text-sm"
                  />
                </label>
              ) : (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Remote HTTPS URL</span>
                  <input
                    value={remoteUrl}
                    onChange={(event) => setRemoteUrl(event.target.value)}
                    placeholder="https://..."
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  />
                </label>
              )}

              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  Type RESTORE to confirm
                </span>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 font-mono"
                />
              </label>

              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Restore replaces current content, users, callsigns, and managed
                files.
              </p>

              <button
                type="submit"
                disabled={
                  restorePending ||
                  hasActive ||
                  confirmation !== "RESTORE" ||
                  (sourceType === "upload" ? !file : !remoteUrl.trim())
                }
                className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
              >
                {restorePending ? "Queueing…" : "Queue restore"}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {view === "jobs" ? (
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Recent Jobs</h2>
            <p className="mt-1 text-sm text-gray-600">
              Jobs refresh automatically every few seconds.
            </p>
          </div>
          {jobs.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-600">No backup jobs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Progress</th>
                    <th className="px-4 py-3 font-medium">Requested by</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-t border-gray-100 align-top"
                    >
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(job.createdAt)}
                      </td>
                      <td className="px-4 py-3 capitalize">{job.kind}</td>
                      <td className={`px-4 py-3 ${statusClass(job.status)}`}>
                        <div>{job.status}</div>
                        <div className="text-xs text-gray-500">{job.phase}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{job.message || "—"}</div>
                        <div className="mt-1 text-xs">
                          Collections {job.collectionsDone}/
                          {job.collectionsTotal} · Media {job.mediaDone}/
                          {job.mediaTotal}
                        </div>
                        {job.error ? (
                          <div className="mt-1 text-xs text-red-700">
                            {job.error}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{job.requestedByName || "—"}</div>
                        <div className="text-xs">{job.requestedByEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          {job.canDownload ? (
                            <a
                              href={`/api/admin/backup/artifacts/${job.id}`}
                              className="text-sm font-medium hover:underline"
                            >
                              {job.artifactFileName || "Download"}
                            </a>
                          ) : null}
                          {job.status === "queued" ||
                          job.status === "running" ? (
                            <button
                              type="button"
                              disabled={actionJobId === job.id}
                              onClick={() => void cancelJob(job.id)}
                              className="text-sm font-medium text-amber-700 hover:underline disabled:opacity-60"
                            >
                              {actionJobId === job.id
                                ? "Cancelling…"
                                : "Cancel"}
                            </button>
                          ) : null}
                          {job.status !== "running" ? (
                            <button
                              type="button"
                              disabled={actionJobId === job.id}
                              onClick={() => void deleteJob(job.id)}
                              className="text-sm font-medium text-red-700 hover:underline disabled:opacity-60"
                            >
                              {actionJobId === job.id
                                ? "Deleting…"
                                : "Delete"}
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
          <AdminJobsPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            label="Backup jobs"
            onPageChange={(next) => {
              setPage(next);
              void refreshPage(next, pageSize);
            }}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
              void refreshPage(1, nextSize);
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
