import type { AccountProfileDto } from "@/lib/account-types";
import { connectDb } from "@/lib/db";
import { User } from "@/models/User";

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
  };
}
