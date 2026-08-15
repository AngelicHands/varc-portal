import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CallsignSchema = new Schema(
  {
    sign: { type: String, required: true, unique: true, uppercase: true },
    prefixFamily: {
      type: String,
      enum: ["XV", "3W", "other"],
      required: true,
      index: true,
    },
    areaDigit: { type: String, default: null, index: true },
    operatorIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "CallsignOperator" }],
      default: [],
    },
    latestLicenseId: {
      type: Schema.Types.ObjectId,
      ref: "CallsignLicense",
      default: null,
    },
    eventCount: { type: Number, default: 0 },
    searchNames: { type: [{ type: String }], default: [] },
    searchPermits: { type: [{ type: String }], default: [] },
    latestOperatorName: { type: String, default: "" },
    latestIssuedAt: { type: Date, default: null },
    latestExpiresAt: { type: Date, default: null },
    latestPermitRaw: { type: String, default: "" },
    latestStatus: {
      type: String,
      enum: ["valid", "expired", "unknown"],
      default: "unknown",
      index: true,
    },
  },
  { timestamps: true },
);

CallsignSchema.index({ searchNames: 1 });
CallsignSchema.index({ searchPermits: 1 });
CallsignSchema.index({ latestIssuedAt: -1 });

export type CallsignDocument = InferSchemaType<typeof CallsignSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Callsign: Model<CallsignDocument> =
  mongoose.models.Callsign ??
  mongoose.model<CallsignDocument>("Callsign", CallsignSchema);
