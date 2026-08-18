import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const BACKUP_JOB_KINDS = ["backup", "restore"] as const;
export type BackupJobKind = (typeof BACKUP_JOB_KINDS)[number];

export const BACKUP_JOB_STATUSES = [
  "queued",
  "running",
  "cancelled",
  "succeeded",
  "failed",
] as const;
export type BackupJobStatus = (typeof BACKUP_JOB_STATUSES)[number];

export const BACKUP_JOB_SOURCE_TYPES = [
  "none",
  "upload",
  "remote",
  "artifact",
] as const;
export type BackupJobSourceType = (typeof BACKUP_JOB_SOURCE_TYPES)[number];

const BackupJobSchema = new Schema(
  {
    kind: {
      type: String,
      enum: BACKUP_JOB_KINDS,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: BACKUP_JOB_STATUSES,
      required: true,
      default: "queued",
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
    sourceType: {
      type: String,
      enum: BACKUP_JOB_SOURCE_TYPES,
      required: true,
      default: "none",
    },
    sourceArtifactKey: { type: String, default: "", trim: true },
    sourceRemoteUrl: { type: String, default: "", trim: true },
    sourceFileName: { type: String, default: "", trim: true },
    artifactKey: { type: String, default: "", trim: true },
    artifactFileName: { type: String, default: "", trim: true },
    artifactContentType: { type: String, default: "", trim: true },
    artifactSize: { type: Number, default: 0 },
    phase: { type: String, default: "queued", trim: true },
    message: { type: String, default: "", trim: true },
    collectionsDone: { type: Number, default: 0 },
    collectionsTotal: { type: Number, default: 0 },
    mediaDone: { type: Number, default: 0 },
    mediaTotal: { type: Number, default: 0 },
    bytesDone: { type: Number, default: 0 },
    bytesTotal: { type: Number, default: 0 },
    lockedBy: { type: String, default: "", trim: true, index: true },
    startedAt: { type: Date, default: null, index: true },
    finishedAt: { type: Date, default: null, index: true },
    emailSentAt: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

BackupJobSchema.index({ status: 1, createdAt: 1 });
BackupJobSchema.index({ kind: 1, createdAt: -1 });
BackupJobSchema.index({ requestedByEmail: 1, createdAt: -1 });

export type BackupJobDocument = InferSchemaType<typeof BackupJobSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const BackupJob: Model<BackupJobDocument> =
  (mongoose.models.BackupJob as Model<BackupJobDocument> | undefined) ??
  mongoose.model<BackupJobDocument>("BackupJob", BackupJobSchema);
