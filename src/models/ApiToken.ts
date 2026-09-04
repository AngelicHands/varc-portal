import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { API_TOKEN_QSO_SCOPES, API_TOKEN_SCOPES } from "@/lib/api-token";

const ApiTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tokenPrefix: { type: String, required: true, trim: true, index: true },
    tokenHash: { type: String, required: true },
    scopes: {
      type: [String],
      default: () => [...API_TOKEN_QSO_SCOPES],
      validate: {
        validator: (values: string[]) =>
          values.length > 0 &&
          values.every((scope) =>
            (API_TOKEN_SCOPES as readonly string[]).includes(scope),
          ),
        message: "Invalid API token scope",
      },
    },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

ApiTokenSchema.index({ userId: 1, revokedAt: 1 });

export type ApiTokenDocument = InferSchemaType<typeof ApiTokenSchema> & {
  _id: mongoose.Types.ObjectId;
};

if (mongoose.models.ApiToken) {
  delete mongoose.models.ApiToken;
}

export const ApiToken: Model<ApiTokenDocument> =
  mongoose.model<ApiTokenDocument>("ApiToken", ApiTokenSchema);
