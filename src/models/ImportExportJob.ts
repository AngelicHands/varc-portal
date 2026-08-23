import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const IMPORT_EXPORT_JOB_KINDS = ["import", "export"] as const;
export type ImportExportJobKind = (typeof IMPORT_EXPORT_JOB_KINDS)[number];

export const IMPORT_EXPORT_JOB_STATUSES = [
  "queued",
  "running",
  "cancelled",
  "succeeded",
  "failed",
] as const;
export type ImportExportJobStatus = (typeof IMPORT_EXPORT_JOB_STATUSES)[number];

export const IMPORT_EXPORT_JOB_TRIGGERS = ["manual", "scheduled"] as const;
export type ImportExportJobTrigger = (typeof IMPORT_EXPORT_JOB_TRIGGERS)[number];

const ImportExportJobSchema = new Schema(
  {
    kind: {
      type: String,
      enum: IMPORT_EXPORT_JOB_KINDS,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: IMPORT_EXPORT_JOB_STATUSES,
      required: true,
      default: "queued",
      index: true,
    },
    trigger: {
      type: String,
      enum: IMPORT_EXPORT_JOB_TRIGGERS,
      required: true,
      default: "manual",
      index: true,
    },
    requestedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    requestedByEmail: { type: String, required: true, trim: true, index: true },
    requestedByName: { type: String, default: "", trim: true },
    phase: { type: String, default: "queued", trim: true },
    message: { type: String, default: "", trim: true },
    lockedBy: { type: String, default: "", trim: true, index: true },
    startedAt: { type: Date, default: null, index: true },
    finishedAt: { type: Date, default: null, index: true },
    error: { type: String, default: "" },
    commitSha: { type: String, default: "", trim: true },
    htmlUrl: { type: String, default: "", trim: true },
    stats: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

ImportExportJobSchema.index({ status: 1, createdAt: 1 });
ImportExportJobSchema.index({ kind: 1, createdAt: -1 });

export type ImportExportJobDocument = InferSchemaType<
  typeof ImportExportJobSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const ImportExportJob: Model<ImportExportJobDocument> =
  (mongoose.models.ImportExportJob as Model<ImportExportJobDocument> | undefined) ??
  mongoose.model<ImportExportJobDocument>("ImportExportJob", ImportExportJobSchema);
