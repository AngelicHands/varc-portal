export type EmailJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type EmailJobKind =
  | "form_submission_copy"
  | "backup_artifact"
  | "qso_confirmation"
  | "callsign_verification_request";

export type AdminEmailJob = {
  id: string;
  kind: EmailJobKind;
  status: EmailJobStatus;
  to: string;
  subject: string;
  relatedId: string;
  attempts: number;
  maxAttempts: number;
  error: string;
  lockedBy: string;
  mailMessageId: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
};

export function emailJobKindLabel(kind: EmailJobKind): string {
  if (kind === "form_submission_copy") return "Form submission copy";
  if (kind === "backup_artifact") return "Backup artifact";
  if (kind === "qso_confirmation") return "QSO confirmation";
  if (kind === "callsign_verification_request") {
    return "Callsign verification request";
  }
  return kind;
}
