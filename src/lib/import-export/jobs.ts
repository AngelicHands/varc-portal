import mongoose from "mongoose";
import { unstable_noStore as noStore } from "next/cache";
import { connectDb } from "@/lib/db";
import type {
  AdminImportExportJob,
  ImportExportJobKind,
  ImportExportJobTrigger,
  ImportExportJobsPage,
} from "@/lib/import-export/jobs-shared";
import {
  IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
  IMPORT_EXPORT_JOBS_PAGE_SIZES,
} from "@/lib/import-export/jobs-shared";
import {
  ImportExportJob,
  type ImportExportJobDocument,
} from "@/models/ImportExportJob";

export type {
  AdminImportExportJob,
  ImportExportJobKind,
  ImportExportJobStatus,
  ImportExportJobTrigger,
  ImportExportJobsPage,
  ImportExportJobsPageSize,
} from "@/lib/import-export/jobs-shared";
export {
  IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
  IMPORT_EXPORT_JOBS_PAGE_SIZES,
  emptyImportExportJobsPage,
  parseImportExportJobsPage,
  parseImportExportJobsPageSize,
} from "@/lib/import-export/jobs-shared";

function toAdminJob(doc: ImportExportJobDocument): AdminImportExportJob {
  return {
    id: String(doc._id),
    kind: doc.kind,
    status: doc.status,
    trigger: doc.trigger,
    requestedByEmail: doc.requestedByEmail ?? "",
    requestedByName: doc.requestedByName ?? "",
    phase: doc.phase ?? "",
    message: doc.message ?? "",
    error: doc.error ?? "",
    commitSha: doc.commitSha ?? "",
    htmlUrl: doc.htmlUrl ?? "",
    stats: (doc.stats as Record<string, unknown> | null) ?? null,
    startedAt: doc.startedAt ? new Date(doc.startedAt).toISOString() : null,
    finishedAt: doc.finishedAt ? new Date(doc.finishedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

export async function createImportExportJob(params: {
  kind: ImportExportJobKind;
  trigger?: ImportExportJobTrigger;
  requestedByUserId?: string | null;
  requestedByEmail: string;
  requestedByName?: string | null;
}): Promise<AdminImportExportJob> {
  await connectDb();
  const created = await ImportExportJob.create({
    kind: params.kind,
    status: "queued",
    trigger: params.trigger ?? "manual",
    requestedByUserId: params.requestedByUserId
      ? new mongoose.Types.ObjectId(params.requestedByUserId)
      : null,
    requestedByEmail: params.requestedByEmail.trim().toLowerCase(),
    requestedByName: params.requestedByName?.trim() || "",
    phase: "queued",
    message: "Waiting for worker",
  });
  return toAdminJob(created);
}

export async function listImportExportJobsPage(
  kind: ImportExportJobKind,
  page = 1,
  pageSize: number = IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
): Promise<ImportExportJobsPage> {
  noStore();
  await connectDb();

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(
    1,
    Math.min(
      pageSize,
      Math.max(...IMPORT_EXPORT_JOBS_PAGE_SIZES),
    ),
  );
  const filter = { kind };
  const total = await ImportExportJob.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const normalizedPage = Math.min(safePage, totalPages);

  const docs = await ImportExportJob.find(filter)
    .sort({ createdAt: -1 })
    .skip((normalizedPage - 1) * safePageSize)
    .limit(safePageSize)
    .lean();

  return {
    jobs: docs.map((doc) => toAdminJob(doc as ImportExportJobDocument)),
    total,
    page: normalizedPage,
    pageSize: safePageSize,
    totalPages,
  };
}

export async function listImportExportJobs(
  kind?: ImportExportJobKind,
  limit = 20,
): Promise<AdminImportExportJob[]> {
  if (kind) {
    return listImportExportJobsPage(kind, 1, limit).then((result) => result.jobs);
  }
  noStore();
  await connectDb();
  const docs = await ImportExportJob.find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .lean();
  return docs.map((doc) => toAdminJob(doc as ImportExportJobDocument));
}

export async function deleteImportExportJob(id: string): Promise<boolean> {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return false;
  await connectDb();
  const result = await ImportExportJob.deleteOne({
    _id: id,
    status: { $ne: "running" },
  });
  return result.deletedCount === 1;
}

export async function getImportExportJobDocument(
  id: string,
): Promise<ImportExportJobDocument | null> {
  if (!id) return null;
  await connectDb();
  return ImportExportJob.findById(id);
}

export async function hasActiveImportExportJob(
  kind?: ImportExportJobKind,
): Promise<boolean> {
  await connectDb();
  const filter: Record<string, unknown> = {
    status: { $in: ["queued", "running"] },
  };
  if (kind) filter.kind = kind;
  const doc = await ImportExportJob.findOne(filter).select("_id").lean();
  return Boolean(doc);
}

export async function markImportExportJobSucceeded(
  id: string,
  patch: {
    message?: string;
    stats?: Record<string, unknown>;
    commitSha?: string;
    htmlUrl?: string;
  },
): Promise<void> {
  await connectDb();
  await ImportExportJob.updateOne(
    { _id: id },
    {
      $set: {
        status: "succeeded",
        finishedAt: new Date(),
        lockedBy: "",
        phase: "done",
        error: "",
        message: patch.message ?? "Completed",
        stats: patch.stats ?? null,
        commitSha: patch.commitSha ?? "",
        htmlUrl: patch.htmlUrl ?? "",
      },
    },
  );
}

export async function markImportExportJobFailed(
  id: string,
  errMsg: string,
): Promise<void> {
  const message = errMsg.trim().slice(0, 500) || "Job failed";
  await connectDb();
  await ImportExportJob.updateOne(
    { _id: id },
    {
      $set: {
        status: "failed",
        finishedAt: new Date(),
        lockedBy: "",
        phase: "failed",
        message: "Job failed",
        error: message,
      },
    },
  );
}

export async function updateImportExportJobProgress(
  id: string,
  patch: { phase?: string; message?: string },
): Promise<void> {
  await connectDb();
  const set: Record<string, string> = {};
  if (patch.phase) set.phase = patch.phase;
  if (patch.message) set.message = patch.message;
  if (Object.keys(set).length === 0) return;
  await ImportExportJob.updateOne({ _id: id }, { $set: set });
}
