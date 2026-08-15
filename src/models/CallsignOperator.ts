import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CallsignOperatorSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    nameNormalized: { type: String, required: true, index: true },
    aliases: { type: [{ type: String }], default: [] },
    kind: {
      type: String,
      enum: ["person", "org", "unknown"],
      default: "person",
      index: true,
    },
  },
  { timestamps: true },
);

export type CallsignOperatorDocument = InferSchemaType<
  typeof CallsignOperatorSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const CallsignOperator: Model<CallsignOperatorDocument> =
  mongoose.models.CallsignOperator ??
  mongoose.model<CallsignOperatorDocument>(
    "CallsignOperator",
    CallsignOperatorSchema,
  );
