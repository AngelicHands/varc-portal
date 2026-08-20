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
    emailVerified: { type: Date, default: null },
  },
  { timestamps: true },
);

UserSchema.index({ callsign: 1 }, { sparse: true });

export type UserDocument = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
  role: Role | string;
};

export const User: Model<UserDocument> =
  mongoose.models.User ?? mongoose.model<UserDocument>("User", UserSchema);
