import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import type { Role } from "@/lib/roles";

export const CALLSIGN_VERIFICATION_STATUSES = [
  "unverified",
  "pending",
  "verified",
  "rejected",
] as const;

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
    callsignVerificationStatus: {
      type: String,
      enum: CALLSIGN_VERIFICATION_STATUSES,
      default: "unverified",
    },
    isProfilePublic: { type: Boolean, default: true },
    isQsoPublic: { type: Boolean, default: false },
    isLocationPublic: { type: Boolean, default: false },
    isDocumentsPublic: { type: Boolean, default: false },
    birthday: { type: Date, default: null },
    gender: {
      type: String,
      enum: ["", "male", "female", "other"],
      default: "",
    },
    homeGrid: { type: String, default: "", trim: true, uppercase: true },
    /** WGS84 station location (marker); optional companion to homeGrid. */
    homeLat: { type: Number, default: null },
    homeLng: { type: Number, default: null },
    /** Street / locality line; shared only when location is public. */
    address: { type: String, default: "", trim: true },
    /** ISO 3166-1 alpha-2 country code for address. */
    addressCountry: { type: String, default: "", trim: true, uppercase: true },
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
