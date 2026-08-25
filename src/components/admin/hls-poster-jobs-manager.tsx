"use client";

import { useEffect, useMemo, useState } from "react";
import { notifyAction } from "@/components/admin/admin-toast";
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

  async function deleteJob(jobId: string) {
    setActionJobId(jobId);
    try {
      const response = await fetch(`/api/admin/hls-poster/jobs/${jobId}`, {
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
      setJobs((current) => current.filter((job) => job.id !== jobId));
      notifyAction({ ok: true }, "Job deleted");
    } finally {
      setActionJobId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">HLS poster</h2>
        <p className="mt-1 text-sm text-gray-600">
          Queue a job for the HLS poster worker to find videos missing thumbnails,
          generate posters with ffmpeg, and write them back to articles. The
          worker must be running (`pnpm worker:hls-poster` or the k8s
          hls-poster-worker deployment).
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || hasActive}
            onClick={() => void startJob()}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {pending ? "Working…" : hasActive ? "Job in progress" : "Start job"}
          </button>
          <button
            type="button"
            disabled={pending || !hasActive}
            onClick={() => void stopAll()}
            className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
          >
            Stop active jobs
          </button>
          {hasActive ? (
            <span className="text-sm text-amber-700">
              A job is queued or running — progress updates below.
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Jobs</h2>
          <p className="mt-1 text-sm text-gray-600">
            Refreshes automatically every few seconds.
          </p>
        </div>
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
                    <td className={`px-4 py-3 ${statusClass(job.status)}`}>
                      <div>{job.status}</div>
                      <div className="text-xs text-gray-500">{job.phase}</div>
                      {job.lockedBy ? (
                        <div className="text-xs text-gray-400">
                          {job.lockedBy}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{job.message || "—"}</div>
                      <div className="mt-1 text-xs">
                        Scanned {job.articlesScanned} · Updated{" "}
                        {job.articlesUpdated} · Posters {job.postersGenerated} ·
                        Errors {job.errorCount}
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
                        {job.status === "queued" || job.status === "running" ? (
                          <button
                            type="button"
                            disabled={actionJobId === job.id}
                            onClick={() => void cancelJob(job.id)}
                            className="text-sm font-medium text-amber-700 hover:underline disabled:opacity-60"
                          >
                            {actionJobId === job.id ? "Cancelling…" : "Cancel"}
                          </button>
                        ) : null}
                        {job.status === "failed" ||
                        job.status === "cancelled" ? (
                          <button
                            type="button"
                            disabled={actionJobId === job.id || hasActive}
                            onClick={() => void retryJob(job.id)}
                            className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-60"
                          >
                            {actionJobId === job.id ? "Retrying…" : "Retry"}
                          </button>
                        ) : null}
                        {job.status !== "running" ? (
                          <button
                            type="button"
                            disabled={actionJobId === job.id}
                            onClick={() => void deleteJob(job.id)}
                            className="text-sm font-medium text-red-700 hover:underline disabled:opacity-60"
                          >
                            {actionJobId === job.id ? "Deleting…" : "Delete"}
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
    </div>
  );
}
