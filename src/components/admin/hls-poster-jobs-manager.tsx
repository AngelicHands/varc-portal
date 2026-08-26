"use client";

import { useEffect, useMemo, useState } from "react";
import { notifyAction } from "@/components/admin/admin-toast";
import {
  AlertIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon,
} from "@/components/admin/admin-action-icons";
import {
  IconActionButton,
  RowActionsGroup,
} from "@/components/admin/icon-action-button";
import { JobErrorModal } from "@/components/admin/job-error-modal";
import { useConfirm } from "@/components/admin/use-confirm";
import type { AdminHlsPosterJob } from "@/lib/hls-poster/jobs";

type Props = {
  initialJobs: AdminHlsPosterJob[];
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

export function HlsPosterJobsManager({ initialJobs }: Props) {
  const [jobs, setJobs] = useState(initialJobs);
  const [pending, setPending] = useState(false);
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const { ask, modal } = useConfirm();

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/admin/hls-poster/jobs", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          jobs?: AdminHlsPosterJob[];
        };
        if (payload.jobs) setJobs(payload.jobs);
      } catch {
        // Ignore polling failures.
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const hasActive = useMemo(
    () => jobs.some((job) => job.status === "queued" || job.status === "running"),
    [jobs],
  );

  function replaceJob(nextJob: AdminHlsPosterJob) {
    setJobs((current) => {
      const exists = current.some((job) => job.id === nextJob.id);
      if (!exists) return [nextJob, ...current];
      return current.map((job) => (job.id === nextJob.id ? nextJob : job));
    });
  }

  async function startJob() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/hls-poster/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        job?: AdminHlsPosterJob;
      };
      if (!response.ok || !payload.job) {
        notifyAction(
          { ok: false, error: payload.error || "Failed to start job" },
          "",
        );
        return;
      }
      notifyAction({ ok: true }, "HLS poster job queued");
      setJobs((current) => [payload.job!, ...current]);
    } finally {
      setPending(false);
    }
  }

  async function stopAll() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/hls-poster/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        jobs?: AdminHlsPosterJob[];
        stopped?: number;
      };
      if (!response.ok) {
        notifyAction(
          { ok: false, error: payload.error || "Failed to stop jobs" },
          "",
        );
        return;
      }
      if (payload.jobs) setJobs(payload.jobs);
      notifyAction(
        { ok: true },
        payload.stopped
          ? `Stopped ${payload.stopped} job(s)`
          : "No active jobs to stop",
      );
    } finally {
      setPending(false);
    }
  }

  async function cancelJob(jobId: string) {
    setActionJobId(jobId);
    try {
      const response = await fetch(`/api/admin/hls-poster/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        job?: AdminHlsPosterJob;
      };
      if (!response.ok || !payload.job) {
        notifyAction(
          { ok: false, error: payload.error || "Failed to cancel job" },
          "",
        );
        return;
      }
      replaceJob(payload.job);
      notifyAction({ ok: true }, "Job cancelled");
    } finally {
      setActionJobId(null);
    }
  }

  async function retryJob(jobId: string) {
    setActionJobId(jobId);
    try {
      const response = await fetch(`/api/admin/hls-poster/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        job?: AdminHlsPosterJob;
      };
      if (!response.ok || !payload.job) {
        notifyAction(
          { ok: false, error: payload.error || "Failed to retry job" },
          "",
        );
        return;
      }
      replaceJob(payload.job);
      notifyAction({ ok: true }, "Job re-queued");
    } finally {
      setActionJobId(null);
    }
  }

  async function confirmDeleteJob(job: AdminHlsPosterJob) {
    const confirmed = await ask({
      title: "Delete HLS poster job?",
      message: `Remove this ${job.status} job from ${formatDate(job.createdAt)}? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    setActionJobId(job.id);
    try {
      const response = await fetch(`/api/admin/hls-poster/jobs/${job.id}`, {
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
      setJobs((current) => current.filter((item) => item.id !== job.id));
      notifyAction({ ok: true }, "Job deleted");
    } finally {
      setActionJobId(null);
    }
  }

  const runLabel = pending
    ? "Working…"
    : hasActive
      ? "Job in progress"
      : "Start job";

  return (
    <>
      <div className="mt-8">
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">
                HLS poster jobs
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Queue a worker job to find videos missing thumbnails, generate
                posters with ffmpeg, and write them back to articles. The worker
                must be running (`pnpm worker:hls-poster` or the k8s
                hls-poster-worker deployment).
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending || !hasActive}
                onClick={() => void stopAll()}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Stop active
              </button>
              <button
                type="button"
                disabled={pending || hasActive}
                onClick={() => void startJob()}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                {runLabel}
              </button>
            </div>
          </div>

          {hasActive ? (
            <p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800">
              A job is queued or running — progress updates automatically.
            </p>
          ) : null}

          {jobs.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-600">
              No HLS poster jobs yet. Click Start job to enqueue one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Created</th>
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
                      <tr
                        key={job.id}
                        className="border-t border-gray-100 align-top"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {formatDate(job.createdAt)}
                        </td>
                        <td
                          className={`px-4 py-3 font-medium ${statusClass(job.status)}`}
                        >
                          <div>{job.status}</div>
                          {job.phase ? (
                            <div className="text-xs font-normal text-gray-500">
                              {job.phase}
                            </div>
                          ) : null}
                          {job.lockedBy ? (
                            <div className="text-xs font-normal text-gray-400">
                              {job.lockedBy}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <div>{job.message || "—"}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            Scanned {job.articlesScanned} · Updated{" "}
                            {job.articlesUpdated} · Posters{" "}
                            {job.postersGenerated} · Errors {job.errorCount}
                          </div>
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
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <div>{job.requestedByName || "—"}</div>
                          <div className="text-xs">{job.requestedByEmail}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RowActionsGroup>
                            {job.status === "queued" ||
                            job.status === "running" ? (
                              <IconActionButton
                                label={
                                  actionJobId === job.id
                                    ? "Cancelling job"
                                    : "Cancel job"
                                }
                                disabled={actionJobId === job.id}
                                onClick={() => void cancelJob(job.id)}
                              >
                                <StopIcon />
                              </IconActionButton>
                            ) : null}
                            {job.status === "failed" ||
                            job.status === "cancelled" ? (
                              <IconActionButton
                                label={
                                  actionJobId === job.id
                                    ? "Retrying job"
                                    : "Retry job"
                                }
                                disabled={actionJobId === job.id || hasActive}
                                onClick={() => void retryJob(job.id)}
                              >
                                <RefreshIcon />
                              </IconActionButton>
                            ) : null}
                            {job.status !== "running" ? (
                              <IconActionButton
                                label={
                                  actionJobId === job.id
                                    ? "Deleting job"
                                    : "Delete job"
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
                          </RowActionsGroup>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <JobErrorModal
        open={Boolean(errorDetail)}
        title="HLS poster job error"
        message={errorDetail || ""}
        onClose={() => setErrorDetail(null)}
      />
      {modal}
    </>
  );
}
