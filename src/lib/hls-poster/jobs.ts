import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import {
  HlsPosterJob,
  type HlsPosterJobDocument,
  type HlsPosterJobKind,
  type HlsPosterJobStatus,
} from "@/models/HlsPosterJob";

export type AdminHlsPosterJob = {
  id: string;
  kind: HlsPosterJobKind;
  status: HlsPosterJobStatus;
  requestedByEmail: string;
  requestedByName: string;
  phase: string;
  message: string;
  articlesScanned: number;
  articlesUpdated: number;
  postersGenerated: number;
  articlesSkipped: number;
  errorCount: number;
  batchLimit: number;
  error: string;
  lockedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
};

function toAdminJob(doc: HlsPosterJobDocument): AdminHlsPosterJob {
  return {
    id: String(doc._id),
    kind: doc.kind,
    status: doc.status,
    requestedByEmail: doc.requestedByEmail ?? "",
    requestedByName: doc.requestedByName ?? "",
    phase: doc.phase ?? "",
    message: doc.message ?? "",
    articlesScanned: doc.articlesScanned ?? 0,
    articlesUpdated: doc.articlesUpdated ?? 0,
    postersGenerated: doc.postersGenerated ?? 0,
    articlesSkipped: doc.articlesSkipped ?? 0,
    errorCount: doc.errorCount ?? 0,
    batchLimit: doc.batchLimit ?? 0,
    error: doc.error ?? "",
    lockedBy: doc.lockedBy ?? "",
    startedAt: doc.startedAt ? new Date(doc.startedAt).toISOString() : null,
    finishedAt: doc.finishedAt ? new Date(doc.finishedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

export async function createHlsPosterJob(params: {
  requestedByUserId?: string | null;
  requestedByEmail: string;
  requestedByName?: string | null;
  batchLimit?: number;
}): Promise<AdminHlsPosterJob> {
  await connectDb();
  const created = await HlsPosterJob.create({
    kind: "backfill",
    status: "queued",
    requestedByUserId: params.requestedByUserId
      ? new mongoose.Types.ObjectId(params.requestedByUserId)
      : null,
    requestedByEmail: params.requestedByEmail.trim().toLowerCase(),
    requestedByName: params.requestedByName?.trim() || "",
    phase: "queued",
    message: "Waiting for HLS poster worker",
    batchLimit: Math.max(0, params.batchLimit ?? 0),
  });
  return toAdminJob(created);
}

export async function listHlsPosterJobs(
  limit = 30,
): Promise<AdminHlsPosterJob[]> {
  await connectDb();
  const docs = await HlsPosterJob.find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .lean();
  return docs.map((doc) => toAdminJob(doc as HlsPosterJobDocument));
}

export async function getHlsPosterJob(
  id: string,
): Promise<AdminHlsPosterJob | null> {
  if (!id) return null;
  await connectDb();
  const doc = await HlsPosterJob.findById(id).lean();
  return doc ? toAdminJob(doc as HlsPosterJobDocument) : null;
}

export async function hasActiveHlsPosterJob(): Promise<boolean> {
  await connectDb();
  const count = await HlsPosterJob.countDocuments({
    status: { $in: ["queued", "running"] },
  });
  return count > 0;
}

export async function claimNextHlsPosterJob(
  workerId: string,
): Promise<HlsPosterJobDocument | null> {
  await connectDb();
  return HlsPosterJob.findOneAndUpdate(
    { status: "queued" },
    {
      $set: {
        status: "running",
        startedAt: new Date(),
        lockedBy: workerId,
        phase: "scanning",
        message: "Worker claimed job",
        error: "",
      },
    },
    {
      returnDocument: "after",
      sort: { createdAt: 1 },
    },
  );
}

export async function updateHlsPosterJobProgress(
  id: string,
  patch: Partial<
    Pick<
      HlsPosterJobDocument,
      | "phase"
      | "message"
      | "articlesScanned"
      | "articlesUpdated"
      | "postersGenerated"
      | "articlesSkipped"
      | "errorCount"
    >
  >,
): Promise<void> {
  if (!id) return;
  await connectDb();
  await HlsPosterJob.findByIdAndUpdate(id, { $set: { ...patch } });
}

export async function isHlsPosterJobCancelled(id: string): Promise<boolean> {
  if (!id) return false;
  await connectDb();
  const doc = await HlsPosterJob.findById(id, { status: 1 }).lean();
  return doc?.status === "cancelled";
}

export async function markHlsPosterJobSucceeded(
  id: string,
  message = "Completed",
): Promise<void> {
  await connectDb();
  await HlsPosterJob.findByIdAndUpdate(id, {
    $set: {
      status: "succeeded",
      finishedAt: new Date(),
      lockedBy: "",
      phase: "done",
      message,
      error: "",
    },
  });
}

export async function markHlsPosterJobFailed(
  id: string,
  error: string,
  phase = "failed",
): Promise<void> {
  if (!id) return;
  await connectDb();
  await HlsPosterJob.findByIdAndUpdate(id, {
    $set: {
      status: "failed",
      finishedAt: new Date(),
      lockedBy: "",
      phase,
      message: "Job failed",
      error: error.slice(0, 500),
    },
  });
}

export async function markHlsPosterJobCancelledFinished(
  id: string,
  message = "Cancelled",
): Promise<void> {
  if (!id) return;
  await connectDb();
  await HlsPosterJob.findByIdAndUpdate(id, {
    $set: {
      status: "cancelled",
      finishedAt: new Date(),
      lockedBy: "",
      phase: "cancelled",
      message,
    },
  });
}

/** Cancel a single queued/running job. */
export async function cancelHlsPosterJob(
  id: string,
): Promise<AdminHlsPosterJob | null> {
  if (!id) return null;
  await connectDb();
  const doc = await HlsPosterJob.findOneAndUpdate(
    { _id: id, status: { $in: ["queued", "running"] } },
    {
      $set: {
        status: "cancelled",
        finishedAt: new Date(),
        lockedBy: "",
        phase: "cancelled",
        message: "Cancelled by admin",
      },
    },
    { returnDocument: "after" },
  );
  return doc ? toAdminJob(doc) : null;
}

/** Cancel all queued/running jobs (Stop). */
export async function stopAllHlsPosterJobs(): Promise<number> {
  await connectDb();
  const result = await HlsPosterJob.updateMany(
    { status: { $in: ["queued", "running"] } },
    {
      $set: {
        status: "cancelled",
        finishedAt: new Date(),
        lockedBy: "",
        phase: "cancelled",
        message: "Stopped by admin",
      },
    },
  );
  return result.modifiedCount;
}

/** Re-queue a failed or cancelled job. */
export async function retryHlsPosterJob(
  id: string,
): Promise<AdminHlsPosterJob | null> {
  if (!id) return null;
  await connectDb();
  const doc = await HlsPosterJob.findOneAndUpdate(
    { _id: id, status: { $in: ["failed", "cancelled"] } },
    {
      $set: {
        status: "queued",
        phase: "queued",
        message: "Re-queued for retry",
        error: "",
        lockedBy: "",
        startedAt: null,
        finishedAt: null,
        articlesScanned: 0,
        articlesUpdated: 0,
        postersGenerated: 0,
        articlesSkipped: 0,
        errorCount: 0,
      },
    },
    { returnDocument: "after" },
  );
  return doc ? toAdminJob(doc) : null;
}

export async function deleteHlsPosterJob(id: string): Promise<boolean> {
  if (!id) return false;
  await connectDb();
  const result = await HlsPosterJob.deleteOne({
    _id: id,
    status: { $ne: "running" },
  });
  return result.deletedCount > 0;
}

/** Mark stale running jobs as failed (worker crash). */
export async function failStaleRunningHlsPosterJobs(
  maxAgeMs = 2 * 60 * 60 * 1000,
): Promise<number> {
  await connectDb();
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await HlsPosterJob.updateMany(
    {
      status: "running",
      startedAt: { $ne: null, $lt: cutoff },
    },
    {
      $set: {
        status: "failed",
        finishedAt: new Date(),
        lockedBy: "",
        phase: "stale",
        message: "Marked failed — worker did not finish in time",
        error: "Stale running job",
      },
    },
  );
  return result.modifiedCount;
}
