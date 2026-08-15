import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CallsignImportSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    sourceFile: { type: String, required: true },
    sourceCreated: { type: String, default: "" },
    rowCount: { type: Number, required: true },
    operatorCount: { type: Number, required: true },
    callsignCount: { type: Number, required: true },
    importedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export type CallsignImportDocument = InferSchemaType<
  typeof CallsignImportSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const CallsignImport: Model<CallsignImportDocument> =
  mongoose.models.CallsignImport ??
  mongoose.model<CallsignImportDocument>(
    "CallsignImport",
    CallsignImportSchema,
  );
