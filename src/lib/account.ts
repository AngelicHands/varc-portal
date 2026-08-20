import type { AccountProfileDto, ProfileGender } from "@/lib/account-types";
import { connectDb } from "@/lib/db";
import { User } from "@/models/User";

function toDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toGender(value: unknown): ProfileGender {
  if (value === "male" || value === "female" || value === "other") return value;
  return "";
}

export async function getAccountProfile(
  userId: string,
  email?: string | null,
): Promise<AccountProfileDto | null> {
  await connectDb();
  const normalizedEmail = email?.toLowerCase().trim() ?? "";
  let user =
    userId.trim().length > 0 ? await User.findById(userId.trim()).lean() : null;
  if (!user && normalizedEmail) {
    user = await User.findOne({ email: normalizedEmail }).lean();
  }
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.name?.trim() ?? "",
    email: user.email ?? "",
    callsign: user.callsign?.trim() ?? "",
    callsignVerified: Boolean(user.callsignVerified),
    callsignVerificationStatus:
      user.callsignVerificationStatus === "pending" ||
      user.callsignVerificationStatus === "verified" ||
      user.callsignVerificationStatus === "rejected"
        ? user.callsignVerificationStatus
        : Boolean(user.callsignVerified)
          ? "verified"
          : "unverified",
    birthday: toDateOnly(user.birthday),
    gender: toGender(user.gender),
    isProfilePublic: user.isProfilePublic !== false,
    isQsoPublic: Boolean(user.isQsoPublic),
    homeGrid: user.homeGrid?.trim().toUpperCase() ?? "",
    homeLat:
      typeof user.homeLat === "number" && Number.isFinite(user.homeLat)
        ? user.homeLat
        : null,
    homeLng:
      typeof user.homeLng === "number" && Number.isFinite(user.homeLng)
        ? user.homeLng
        : null,
  };
}
