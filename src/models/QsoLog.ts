import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const QsoLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    workedCallsign: { type: String, required: true, trim: true, uppercase: true },
    qsoAt: { type: Date, required: true, index: true },
    band: { type: String, required: true, trim: true },
    freqMhz: { type: Number, default: null },
    mode: { type: String, required: true, trim: true },
    rstSent: { type: String, default: "59", trim: true },
    rstRcvd: { type: String, default: "59", trim: true },
    qso_sent: { type: Boolean, default: true },
    qso_confirmed: { type: Boolean, default: false },
    confirmationTokenHash: { type: String, default: "", index: true },
    confirmationExpiresAt: { type: Date, default: null },
    confirmationSentAt: { type: Date, default: null },
    confirmationRecipientUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    confirmedAt: { type: Date, default: null },
    confirmedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    grid: { type: String, default: "", trim: true, uppercase: true },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

QsoLogSchema.index({ userId: 1, qsoAt: -1 });
QsoLogSchema.index({ workedCallsign: 1 });

export type QsoLogDocument = InferSchemaType<typeof QsoLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const QsoLog: Model<QsoLogDocument> =
  mongoose.models.QsoLog ??
  mongoose.model<QsoLogDocument>("QsoLog", QsoLogSchema);
