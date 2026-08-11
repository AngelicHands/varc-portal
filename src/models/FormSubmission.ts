import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { FORM_SUBMISSION_STATUSES } from "@/lib/validations/forms";

const FormSubmissionSchema = new Schema(
  {
    formId: {
      type: Schema.Types.ObjectId,
      ref: "FormDefinition",
      required: true,
      index: true,
    },
    formNameSnapshot: { type: String, required: true, trim: true },
    formKeySnapshot: { type: String, required: true, trim: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: FORM_SUBMISSION_STATUSES,
      default: "new",
      index: true,
    },
    pagePath: { type: String, default: "" },
    ipHash: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true },
);

FormSubmissionSchema.index({ formId: 1, createdAt: -1 });
FormSubmissionSchema.index({ status: 1, createdAt: -1 });

export type FormSubmissionDocument = InferSchemaType<typeof FormSubmissionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FormSubmission: Model<FormSubmissionDocument> =
  (mongoose.models.FormSubmission as Model<FormSubmissionDocument> | undefined) ??
  mongoose.model<FormSubmissionDocument>("FormSubmission", FormSubmissionSchema);
