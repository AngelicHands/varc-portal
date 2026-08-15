import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CallsignLicenseSchema = new Schema(
  {
    importKey: { type: String, required: true, index: true },
    stt: { type: Number, required: true },
    operatorId: {
      type: Schema.Types.ObjectId,
      ref: "CallsignOperator",
      required: true,
      index: true,
    },
    operatorName: { type: String, default: "" },
    callsignIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Callsign" }],
      default: [],
    },
    callsignRaw: { type: String, default: "" },
    callsigns: { type: [{ type: String, uppercase: true }], default: [] },
    permitRaw: { type: String, default: "" },
    permitNumber: { type: String, default: "", index: true },
    permitType: {
      type: String,
      enum: ["GP", "GH", "VARC", "unknown", "missing"],
      default: "unknown",
      index: true,
    },
    renewalIndex: { type: Number, default: null },
    issuedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["valid", "expired", "unknown"],
      default: "unknown",
      index: true,
    },
    notes: { type: String, default: "" },
    flags: { type: [{ type: String }], default: [] },
  },
  { timestamps: true },
);

CallsignLicenseSchema.index({ importKey: 1, stt: 1 }, { unique: true });
CallsignLicenseSchema.index({ callsigns: 1, issuedAt: -1 });

export type CallsignLicenseDocument = InferSchemaType<
  typeof CallsignLicenseSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const CallsignLicense: Model<CallsignLicenseDocument> =
  mongoose.models.CallsignLicense ??
  mongoose.model<CallsignLicenseDocument>(
    "CallsignLicense",
    CallsignLicenseSchema,
  );
