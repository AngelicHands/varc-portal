import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  FORM_FIELD_TYPES,
  FORM_FIELD_STYLES,
  FORM_FIELD_WIDTHS,
  FORM_DATE_FORMATS,
  FORM_TIME_FORMATS,
} from "@/lib/validations/forms";

const FormFieldOptionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    checked: { type: Boolean, default: false },
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
    maxLength: { type: Number, default: 0 },
    width: {
      type: String,
      enum: FORM_FIELD_WIDTHS,
      default: "default",
    },
    style: {
      type: String,
      enum: FORM_FIELD_STYLES,
      default: "default",
    },
    dateFormat: {
      type: String,
      enum: FORM_DATE_FORMATS,
      default: "yyyy-mm-dd",
    },
    timeFormat: {
      type: String,
      enum: FORM_TIME_FORMATS,
      default: "HH:mm",
    },
    checked: { type: Boolean, default: false },
    options: { type: [FormFieldOptionSchema], default: [] },
  },
  { _id: false },
);

const FormLocaleSchema = new Schema(
  {
    name: { type: String, default: "" },
    description: { type: String, default: "" },
    submitLabel: { type: String, default: "" },
    successMessage: { type: String, default: "" },
    schemaMarkdown: { type: String, default: "" },
    fields: { type: [FormFieldSchema], default: [] },
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
    /** Denormalized from locales.vi for list sorting / legacy reads. */
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    /** fields = visual field schema; markdown = markdown layout. */
    definitionMode: {
      type: String,
      enum: ["fields", "markdown"],
      default: "fields",
      index: true,
    },
    schemaMarkdown: { type: String, default: "" },
    submitLabel: { type: String, default: "Send" },
    successMessage: {
      type: String,
      default: "Thank you. Your submission has been received.",
    },
    /** Canonical field structure (from Vietnamese). */
    fields: { type: [FormFieldSchema], default: [] },
    locales: {
      vi: { type: FormLocaleSchema, required: true },
      en: { type: FormLocaleSchema, required: true },
    },
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

// Recompile on HMR so enum changes (e.g. new field types) take effect in dev.
if (mongoose.models.FormDefinition) {
  delete mongoose.models.FormDefinition;
}

export const FormDefinition: Model<FormDefinitionDocument> =
  mongoose.model<FormDefinitionDocument>("FormDefinition", FormDefinitionSchema);
