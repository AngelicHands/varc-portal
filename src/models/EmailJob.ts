import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import type { MailMessageKind } from "@/models/MailMessage";

export const EMAIL_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type EmailJobStatus = (typeof EMAIL_JOB_STATUSES)[number];

const EmailJobSchema = new Schema(
  {
    kind: {
      type: String,
      enum: [
        "form_submission_copy",
        "backup_artifact",
        "qso_confirmation",
        "callsign_verification_request",
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: EMAIL_JOB_STATUSES,
      required: true,
      default: "queued",
      index: true,
    },
    to: { type: String, required: true, trim: true, index: true },
    subject: { type: String, required: true, trim: true },
    text: { type: String, default: "" },
    html: { type: String, default: "" },
    clientKey: { type: String, default: "", trim: true },
    relatedId: { type: String, default: "", trim: true, index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lockedBy: { type: String, default: "", trim: true, index: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    mailMessageId: { type: String, default: "", trim: true },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

EmailJobSchema.index({ status: 1, createdAt: 1 });
EmailJobSchema.index({ createdAt: -1 });

export type EmailJobDocument = InferSchemaType<typeof EmailJobSchema> & {
  _id: mongoose.Types.ObjectId;
  kind: MailMessageKind;
};

export const EmailJob: Model<EmailJobDocument> =
  (mongoose.models.EmailJob as Model<EmailJobDocument> | undefined) ??
  mongoose.model<EmailJobDocument>("EmailJob", EmailJobSchema);
