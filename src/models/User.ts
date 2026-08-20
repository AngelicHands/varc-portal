import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import type { Role } from "@/lib/roles";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, default: null },
    role: {
      type: String,
      default: "reader",
      index: true,
    },
    image: { type: String, default: null },
    callsign: { type: String, default: "", trim: true, uppercase: true },
    callsignVerified: { type: Boolean, default: false },
    isProfilePublic: { type: Boolean, default: true },
    isQsoPublic: { type: Boolean, default: false },
    birthday: { type: Date, default: null },
    gender: {
      type: String,
      enum: ["", "male", "female", "other"],
      default: "",
    },
    emailVerified: { type: Date, default: null },
  },
  { timestamps: true },
);

UserSchema.index(
  { callsign: 1 },
  {
    unique: true,
    partialFilterExpression: { callsign: { $gt: "" } },
  },
);

export type UserDocument = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
  role: Role | string;
};

// Recompile on HMR so new fields (e.g. callsignVerified) take effect in dev.
if (mongoose.models.User) {
  delete mongoose.models.User;
}

export const User: Model<UserDocument> =
  mongoose.model<UserDocument>("User", UserSchema);
