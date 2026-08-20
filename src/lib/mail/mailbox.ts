import { connectDb } from "@/lib/db";
import type { AdminMailMessageListItem } from "@/lib/mail/mailbox-types";
import { logServerError } from "@/lib/safe-error";
import {
  MailMessage,
  type MailMessageDocument,
  type MailMessageKind,
  type MailMessageStatus,
} from "@/models/MailMessage";
import { createEmailJob } from "@/lib/mail/jobs";
import type { AdminEmailJob } from "@/lib/mail/job-types";

export type { AdminMailMessageListItem } from "@/lib/mail/mailbox-types";

export type AdminMailMessageDetail = AdminMailMessageListItem & {
  text: string;
  html: string;
  error: string;
};

function toListItem(doc: MailMessageDocument): AdminMailMessageListItem {
  return {
    id: String(doc._id),
    to: doc.to ?? "",
    from: doc.from ?? "",
    subject: doc.subject ?? "",
    status: doc.status as MailMessageStatus,
    kind: doc.kind as MailMessageKind,
    formNameSnapshot: doc.formNameSnapshot ?? "",
    formId: doc.formId ? String(doc.formId) : null,
    submissionId: doc.submissionId ? String(doc.submissionId) : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

function toDetail(doc: MailMessageDocument): AdminMailMessageDetail {
  return {
    ...toListItem(doc),
    text: doc.text ?? "",
    html: doc.html ?? "",
    error: doc.error ?? "",
  };
}

export type RecordMailMessageInput = {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  status: MailMessageStatus;
  kind: MailMessageKind;
  error?: string;
  formId?: string | null;
  formNameSnapshot?: string;
  submissionId?: string | null;
};

export async function recordMailMessage(
  input: RecordMailMessageInput,
): Promise<string | null> {
  try {
    await connectDb();
    const created = await MailMessage.create({
      to: input.to.trim(),
      from: input.from.trim(),
      subject: input.subject.trim(),
      text: input.text ?? "",
      html: input.html ?? "",
      status: input.status,
      kind: input.kind,
      error: (input.error ?? "").slice(0, 500),
      formId: input.formId || null,
      formNameSnapshot: input.formNameSnapshot ?? "",
      submissionId: input.submissionId || null,
    });
    return String(created._id);
  } catch (error) {
    logServerError("mailbox-record", error);
    return null;
  }
}

export async function listMailMessages(limit = 200): Promise<AdminMailMessageListItem[]> {
  await connectDb();
  const docs = await MailMessage.find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 500)))
    .lean();
  return docs.map((doc) => toListItem(doc as MailMessageDocument));
}

export async function getMailMessageById(
  id: string,
): Promise<AdminMailMessageDetail | null> {
  if (!id) return null;
  await connectDb();
  const doc = await MailMessage.findById(id).lean();
  if (!doc) return null;
  return toDetail(doc as MailMessageDocument);
}

export async function deleteMailMessage(id: string): Promise<boolean> {
  if (!id) return false;
  await connectDb();
  const result = await MailMessage.deleteOne({ _id: id });
  return result.deletedCount > 0;
}

export async function resendMailMessage(id: string): Promise<AdminEmailJob | null> {
  const message = await getMailMessageById(id);
  if (!message || message.status !== "failed") return null;
  return createEmailJob({
    kind: message.kind,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

export function mailKindLabel(kind: MailMessageKind): string {
  if (kind === "form_submission_copy") return "Form submission copy";
  if (kind === "backup_artifact") return "Backup artifact";
  if (kind === "qso_confirmation") return "QSO confirmation";
  if (kind === "callsign_verification_request") {
    return "Callsign verification request";
  }
  return kind;
}
