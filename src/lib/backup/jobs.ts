import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { deleteBackupArtifact, getBackupArtifactRetention } from "@/lib/backup/artifact-storage";
import {
  BackupJob,
  type BackupJobDocument,
  type BackupJobKind,
  type BackupJobSourceType,
  type BackupJobStatus,
} from "@/models/BackupJob";
import { logServerError } from "@/lib/safe-error";

export type AdminBackupJob = {
  id: string;
  kind: BackupJobKind;
  status: BackupJobStatus;
  requestedByEmail: string;
  requestedByName: string;
  sourceType: BackupJobSourceType;
  sourceRemoteUrl: string;
  sourceFileName: string;
  artifactFileName: string;
  artifactSize: number;
  phase: string;
  message: string;
  collectionsDone: number;
  collectionsTotal: number;
  mediaDone: number;
  mediaTotal: number;
  bytesDone: number;
  bytesTotal: number;
  error: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  emailSentAt: string | null;
  canDownload: boolean;
};

function toAdminJob(doc: BackupJobDocument): AdminBackupJob {
  return {
    id: String(doc._id),
    kind: doc.kind,
    status: doc.status,
    requestedByEmail: doc.requestedByEmail ?? "",
    requestedByName: doc.requestedByName ?? "",
    sourceType: doc.sourceType,
    sourceRemoteUrl: doc.sourceRemoteUrl ?? "",
    sourceFileName: doc.sourceFileName ?? "",
    artifactFileName: doc.artifactFileName ?? "",
    artifactSize: doc.artifactSize ?? 0,
    phase: doc.phase ?? "",
    message: doc.message ?? "",
    collectionsDone: doc.collectionsDone ?? 0,
    collectionsTotal: doc.collectionsTotal ?? 0,
    mediaDone: doc.mediaDone ?? 0,
    mediaTotal: doc.mediaTotal ?? 0,
    bytesDone: doc.bytesDone ?? 0,
    bytesTotal: doc.bytesTotal ?? 0,
    error: doc.error ?? "",
    startedAt: doc.startedAt ? new Date(doc.startedAt).toISOString() : null,
    finishedAt: doc.finishedAt ? new Date(doc.finishedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    emailSentAt: doc.emailSentAt ? new Date(doc.emailSentAt).toISOString() : null,
    canDownload: Boolean(doc.artifactKey && doc.status === "succeeded"),
  };
}

export async function createBackupJob(params: {
  kind: BackupJobKind;
  requestedByUserId?: string | null;
  requestedByEmail: string;
  requestedByName?: string | null;
  sourceType?: BackupJobSourceType;
  sourceArtifactKey?: string;
  sourceRemoteUrl?: string;
  sourceFileName?: string;
}): Promise<AdminBackupJob> {
  await connectDb();
  const created = await BackupJob.create({
    kind: params.kind,
    status: "queued",
    requestedByUserId: params.requestedByUserId
      ? new mongoose.Types.ObjectId(params.requestedByUserId)
      : null,
    requestedByEmail: params.requestedByEmail.trim().toLowerCase(),
    requestedByName: params.requestedByName?.trim() || "",
    sourceType: params.sourceType ?? "none",
    sourceArtifactKey: params.sourceArtifactKey?.trim() || "",
    sourceRemoteUrl: params.sourceRemoteUrl?.trim() || "",
    sourceFileName: params.sourceFileName?.trim() || "",
    phase: "queued",
    message: "Waiting for worker",
  });
  return toAdminJob(created);
}

export async function listBackupJobs(limit = 20): Promise<AdminBackupJob[]> {
  await connectDb();
  const docs = await BackupJob.find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .lean();
  return docs.map((doc) => toAdminJob(doc as BackupJobDocument));
}

export async function getBackupJob(id: string): Promise<AdminBackupJob | null> {
  if (!id) return null;
  await connectDb();
  const doc = await BackupJob.findById(id).lean();
  return doc ? toAdminJob(doc as BackupJobDocument) : null;
}

export async function getBackupJobDocument(id: string): Promise<BackupJobDocument | null> {
  if (!id) return null;
  await connectDb();
  return BackupJob.findById(id);
}

export async function hasActiveBackupJob(): Promise<boolean> {
  await connectDb();
  const count = await BackupJob.countDocuments({
    status: { $in: ["queued", "running"] },
  });
  return count > 0;
}

export async function claimNextBackupJob(workerId: string): Promise<BackupJobDocument | null> {
  await connectDb();
  return BackupJob.findOneAndUpdate(
    { status: "queued" },
    {
      $set: {
        status: "running",
        startedAt: new Date(),
        lockedBy: workerId,
        phase: "starting",
        message: "Worker claimed job",
      },
    },
    {
      returnDocument: "after",
      sort: { createdAt: 1 },
    },
  );
}

export async function updateBackupJobProgress(
  id: string,
  patch: Partial<
    Pick<
      BackupJobDocument,
      | "phase"
      | "message"
      | "collectionsDone"
      | "collectionsTotal"
      | "mediaDone"
      | "mediaTotal"
      | "bytesDone"
      | "bytesTotal"
    >
  >,
): Promise<void> {
  if (!id) return;
  await connectDb();
  await BackupJob.findByIdAndUpdate(id, {
    $set: {
      ...patch,
    },
  });
}

export async function isBackupJobCancelled(id: string): Promise<boolean> {
  if (!id) return false;
  await connectDb();
  const doc = await BackupJob.findById(id, { status: 1 }).lean();
  return doc?.status === "cancelled";
}

export async function markBackupJobSucceeded(params: {
  id: string;
  artifactKey?: string;
  artifactFileName?: string;
  artifactContentType?: string;
  artifactSize?: number;
  message?: string;
}): Promise<void> {
  await connectDb();
  await BackupJob.findByIdAndUpdate(params.id, {
    $set: {
      status: "succeeded",
      finishedAt: new Date(),
      lockedBy: "",
      phase: "done",
      message: params.message ?? "Completed",
      artifactKey: params.artifactKey ?? "",
      artifactFileName: params.artifactFileName ?? "",
      artifactContentType: params.artifactContentType ?? "",
      artifactSize: params.artifactSize ?? 0,
      error: "",
    },
  });
}

export async function markBackupJobFailed(
  id: string,
  error: string,
  phase = "failed",
): Promise<void> {
  if (!id) return;
  await connectDb();
  await BackupJob.findByIdAndUpdate(id, {
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

export async function cancelBackupJob(
  id: string,
  message = "Cancelled by admin",
): Promise<AdminBackupJob | null> {
  if (!id) return null;
  await connectDb();
  const doc = await BackupJob.findOneAndUpdate(
    {
      _id: id,
      status: { $in: ["queued", "running"] },
    },
    {
      $set: {
        status: "cancelled",
        finishedAt: new Date(),
        lockedBy: "",
        phase: "cancelled",
        message,
        error: "",
      },
    },
    { returnDocument: "after" },
  ).lean();
  return doc ? toAdminJob(doc as BackupJobDocument) : null;
}

export async function deleteBackupJob(id: string): Promise<boolean> {
  if (!id) return false;
  await connectDb();
  const doc = await BackupJob.findById(id).lean();
  if (!doc || doc.status === "running") return false;

  try {
    if (doc.artifactKey) await deleteBackupArtifact(doc.artifactKey);
    if (doc.sourceArtifactKey) await deleteBackupArtifact(doc.sourceArtifactKey);
  } catch (error) {
    logServerError("backup-job-delete", error);
  }

  const result = await BackupJob.deleteOne({ _id: id, status: { $ne: "running" } });
  return result.deletedCount === 1;
}

export async function markBackupEmailSent(id: string): Promise<void> {
  if (!id) return;
  await connectDb();
  await BackupJob.findByIdAndUpdate(id, {
    $set: { emailSentAt: new Date() },
  });
}

export async function cleanupBackupArtifacts(): Promise<void> {
  await connectDb();
  const { maxAgeDays, maxCount } = getBackupArtifactRetention();
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  const oldDocs = await BackupJob.find({
    artifactKey: { $ne: "" },
    finishedAt: { $lt: cutoff },
  })
    .sort({ finishedAt: 1 })
    .lean();

  for (const doc of oldDocs) {
    try {
      if (doc.artifactKey) await deleteBackupArtifact(doc.artifactKey);
      if (doc.sourceArtifactKey) await deleteBackupArtifact(doc.sourceArtifactKey);
      await BackupJob.findByIdAndUpdate(doc._id, {
        $set: {
          artifactKey: "",
          sourceArtifactKey: "",
        },
      });
    } catch (error) {
      logServerError("backup-artifact-cleanup", error);
    }
  }

  const succeeded = await BackupJob.find({
    kind: "backup",
    status: "succeeded",
    artifactKey: { $ne: "" },
  })
    .sort({ finishedAt: -1, createdAt: -1 })
    .lean();

  const staleByCount = succeeded.slice(maxCount);
  for (const doc of staleByCount) {
    try {
      if (doc.artifactKey) await deleteBackupArtifact(doc.artifactKey);
      await BackupJob.findByIdAndUpdate(doc._id, {
        $set: { artifactKey: "" },
      });
    } catch (error) {
      logServerError("backup-artifact-cleanup", error);
    }
  }
}
