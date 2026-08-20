import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import type { UserDocumentKind } from "@/lib/validations/qso";

const UserDocumentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["certificate", "license"],
      required: true,
    },
    key: { type: String, required: true },
    url: { type: String, required: true },
    originalName: { type: String, required: true, trim: true },
    contentType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    uploadedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

UserDocumentSchema.index({ userId: 1, kind: 1, createdAt: -1 });

export type UserDocumentRecord = InferSchemaType<typeof UserDocumentSchema> & {
  _id: mongoose.Types.ObjectId;
  kind: UserDocumentKind;
};

export const UserDocumentModel: Model<UserDocumentRecord> =
  mongoose.models.UserDocument ??
  mongoose.model<UserDocumentRecord>("UserDocument", UserDocumentSchema);
