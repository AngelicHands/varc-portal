import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  FORM_FIELD_TYPES,
  FORM_FIELD_STYLES,
  FORM_FIELD_WIDTHS,
} from "@/lib/validations/forms";

const FormFieldOptionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const FormFieldSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    type: { type: String, enum: FORM_FIELD_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: "" },
    helpText: { type: String, default: "" },
    width: {
      type: String,
      enum: FORM_FIELD_WIDTHS,
      default: "full",
    },
    style: {
      type: String,
      enum: FORM_FIELD_STYLES,
      default: "default",
    },
    options: { type: [FormFieldOptionSchema], default: [] },
  },
  { _id: false },
);

const FormDefinitionSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    schemaMarkdown: { type: String, default: "" },
    submitLabel: { type: String, default: "Send" },
    successMessage: {
      type: String,
      default: "Thank you. Your submission has been received.",
    },
    fields: { type: [FormFieldSchema], default: [] },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

FormDefinitionSchema.index(
  { key: 1 },
  {
    unique: true,
    partialFilterExpression: {
      key: { $type: "string", $gt: "" },
      deletedAt: null,
    },
  },
);

export type FormDefinitionDocument = InferSchemaType<typeof FormDefinitionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FormDefinition: Model<FormDefinitionDocument> =
  (mongoose.models.FormDefinition as Model<FormDefinitionDocument> | undefined) ??
  mongoose.model<FormDefinitionDocument>(
    "FormDefinition",
    FormDefinitionSchema,
  );
