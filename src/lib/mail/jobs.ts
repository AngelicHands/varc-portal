import { connectDb } from "@/lib/db";
import type { AdminEmailJob } from "@/lib/mail/job-types";
import {
  EmailJob,
  type EmailJobDocument,
  type EmailJobStatus,
} from "@/models/EmailJob";
import type { MailMessageKind } from "@/models/MailMessage";

export type { AdminEmailJob } from "@/lib/mail/job-types";

function toAdminJob(doc: EmailJobDocument): AdminEmailJob {
  return {
    id: String(doc._id),
    kind: doc.kind,
    status: doc.status as EmailJobStatus,
    to: doc.to ?? "",
    subject: doc.subject ?? "",
    relatedId: doc.relatedId ?? "",
    attempts: doc.attempts ?? 0,
    maxAttempts: doc.maxAttempts ?? 3,
    error: doc.error ?? "",
    lockedBy: doc.lockedBy ?? "",
    mailMessageId: doc.mailMessageId ?? "",
    startedAt: doc.startedAt ? new Date(doc.startedAt).toISOString() : null,
    finishedAt: doc.finishedAt ? new Date(doc.finishedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

export async function createEmailJob(params: {
  kind: MailMessageKind;
  to: string;
  subject: string;
  text: string;
  html: string;
  clientKey?: string;
  relatedId?: string;
  maxAttempts?: number;
}): Promise<AdminEmailJob> {
  await connectDb();
  const created = await EmailJob.create({
    kind: params.kind,
    status: "queued",
    to: params.to.trim(),
    subject: params.subject.trim(),
    text: params.text,
    html: params.html,
    clientKey: params.clientKey?.trim() || "",
    relatedId: params.relatedId?.trim() || "",
    maxAttempts: params.maxAttempts ?? 3,
  });
  return toAdminJob(created);
}

export async function listEmailJobs(limit = 50): Promise<AdminEmailJob[]> {
  await connectDb();
  const docs = await EmailJob.find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 200)))
    .lean();
  return docs.map((doc) => toAdminJob(doc as EmailJobDocument));
}

export async function getEmailJob(id: string): Promise<AdminEmailJob | null> {
  if (!id) return null;
  await connectDb();
  const doc = await EmailJob.findById(id).lean();
  return doc ? toAdminJob(doc as EmailJobDocument) : null;
}

export async function claimNextEmailJob(
  workerId: string,
): Promise<EmailJobDocument | null> {
  await connectDb();
  return EmailJob.findOneAndUpdate(
    { status: "queued" },
    {
      $set: {
        status: "running",
        startedAt: new Date(),
        lockedBy: workerId,
        error: "",
      },
      $inc: { attempts: 1 },
    },
    {
      returnDocument: "after",
      sort: { createdAt: 1 },
    },
  );
}

export async function markEmailJobSucceeded(params: {
  id: string;
  mailMessageId?: string;
}): Promise<void> {
  await connectDb();
  await EmailJob.findByIdAndUpdate(params.id, {
    $set: {
      status: "succeeded",
      finishedAt: new Date(),
      lockedBy: "",
      error: "",
      mailMessageId: params.mailMessageId ?? "",
    },
  });
}

export async function markEmailJobFailed(params: {
  id: string;
  error: string;
  retry: boolean;
}): Promise<void> {
  await connectDb();
  const doc = await EmailJob.findById(params.id);
  if (!doc) return;

  if (params.retry && doc.attempts < doc.maxAttempts) {
    await EmailJob.findByIdAndUpdate(params.id, {
      $set: {
        status: "queued",
        lockedBy: "",
        error: params.error.slice(0, 500),
        startedAt: null,
      },
    });
    return;
  }

  await EmailJob.findByIdAndUpdate(params.id, {
    $set: {
      status: "failed",
      finishedAt: new Date(),
      lockedBy: "",
      error: params.error.slice(0, 500),
    },
  });
}

export async function cancelEmailJob(id: string): Promise<AdminEmailJob | null> {
  if (!id) return null;
  await connectDb();
  const doc = await EmailJob.findOneAndUpdate(
    { _id: id, status: { $in: ["queued", "running"] } },
    {
      $set: {
        status: "cancelled",
        finishedAt: new Date(),
        lockedBy: "",
        error: "Cancelled by admin",
      },
    },
    { returnDocument: "after" },
  );
  return doc ? toAdminJob(doc) : null;
}

export async function retryEmailJob(id: string): Promise<AdminEmailJob | null> {
  if (!id) return null;
  await connectDb();
  const doc = await EmailJob.findOneAndUpdate(
    { _id: id, status: "failed" },
    {
      $set: {
        status: "queued",
        startedAt: null,
        finishedAt: null,
        lockedBy: "",
        error: "",
        attempts: 0,
      },
    },
    { returnDocument: "after" },
  );
  return doc ? toAdminJob(doc) : null;
}

export async function deleteEmailJob(id: string): Promise<boolean> {
  if (!id) return false;
  await connectDb();
  const result = await EmailJob.deleteOne({
    _id: id,
    status: { $ne: "running" },
  });
  return result.deletedCount > 0;
}

export async function failStaleRunningEmailJobs(
  staleMs = 30 * 60 * 1000,
): Promise<number> {
  await connectDb();
  const cutoff = new Date(Date.now() - staleMs);
  const result = await EmailJob.updateMany(
    {
      status: "running",
      startedAt: { $lt: cutoff },
    },
    {
      $set: {
        status: "failed",
        finishedAt: new Date(),
        lockedBy: "",
        error: "Worker timed out",
      },
    },
  );
  if (result.modifiedCount > 0) {
    console.warn(
      `[email-worker] marked ${result.modifiedCount} stale email job(s) as failed`,
    );
  }
  return result.modifiedCount;
}
