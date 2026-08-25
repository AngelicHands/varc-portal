import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const HLS_POSTER_JOB_KINDS = ["backfill"] as const;
export type HlsPosterJobKind = (typeof HLS_POSTER_JOB_KINDS)[number];

export const HLS_POSTER_JOB_STATUSES = [
  "queued",
  "running",
  "cancelled",
  "succeeded",
  "failed",
] as const;
export type HlsPosterJobStatus = (typeof HLS_POSTER_JOB_STATUSES)[number];

const HlsPosterJobSchema = new Schema(
  {
    kind: {
      type: String,
      enum: HLS_POSTER_JOB_KINDS,
      required: true,
      default: "backfill",
      index: true,
    },
    status: {
      type: String,
      enum: HLS_POSTER_JOB_STATUSES,
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
    phase: { type: String, default: "queued", trim: true },
    message: { type: String, default: "", trim: true },
    articlesScanned: { type: Number, default: 0 },
    articlesUpdated: { type: Number, default: 0 },
    postersGenerated: { type: Number, default: 0 },
    articlesSkipped: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    lockedBy: { type: String, default: "", trim: true, index: true },
    startedAt: { type: Date, default: null, index: true },
    finishedAt: { type: Date, default: null, index: true },
    error: { type: String, default: "" },
    /** Optional: limit how many articles this job may update (0 = use env batch / full pass). */
    batchLimit: { type: Number, default: 0 },
  },
  { timestamps: true },
);

HlsPosterJobSchema.index({ status: 1, createdAt: 1 });
HlsPosterJobSchema.index({ createdAt: -1 });

export type HlsPosterJobDocument = InferSchemaType<typeof HlsPosterJobSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export const HlsPosterJob: Model<HlsPosterJobDocument> =
  (mongoose.models.HlsPosterJob as Model<HlsPosterJobDocument> | undefined) ??
  mongoose.model<HlsPosterJobDocument>("HlsPosterJob", HlsPosterJobSchema);
