import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const MAIL_MESSAGE_KINDS = [
  "form_submission_copy",
  "backup_artifact",
  "qso_confirmation",
  "callsign_verification_request",
] as const;
export type MailMessageKind = (typeof MAIL_MESSAGE_KINDS)[number];

export const MAIL_MESSAGE_STATUSES = ["sent", "failed"] as const;
export type MailMessageStatus = (typeof MAIL_MESSAGE_STATUSES)[number];

const MailMessageSchema = new Schema(
  {
    to: { type: String, required: true, trim: true, index: true },
    from: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    text: { type: String, default: "" },
    html: { type: String, default: "" },
    status: {
      type: String,
      enum: MAIL_MESSAGE_STATUSES,
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: MAIL_MESSAGE_KINDS,
      required: true,
      index: true,
    },
    error: { type: String, default: "" },
    formId: {
      type: Schema.Types.ObjectId,
      ref: "FormDefinition",
      default: null,
      index: true,
    },
    formNameSnapshot: { type: String, default: "" },
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: "FormSubmission",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

MailMessageSchema.index({ createdAt: -1 });
MailMessageSchema.index({ status: 1, createdAt: -1 });

export type MailMessageDocument = InferSchemaType<typeof MailMessageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MailMessage: Model<MailMessageDocument> =
  (mongoose.models.MailMessage as Model<MailMessageDocument> | undefined) ??
  mongoose.model<MailMessageDocument>("MailMessage", MailMessageSchema);
