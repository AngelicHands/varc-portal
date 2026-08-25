import { connectDb } from "@/lib/db";
import { listRoles, type PublicRole } from "@/lib/app-roles";
import { User } from "@/models/User";

export type ContentAccessOption = { id: string; label: string };

export async function listContentAccessUserOptions(): Promise<
  ContentAccessOption[]
> {
  await connectDb();
  const users = await User.find()
    .select("name email")
    .sort({ email: 1 })
    .limit(500)
    .lean();
  return users.map((user) => {
    const name = String(user.name ?? "").trim();
    const email = String(user.email ?? "").trim();
    return {
      id: String(user._id),
      label: name ? `${name} (${email})` : email || String(user._id),
    };
  });
}

export async function listContentAccessRoleOptions(): Promise<
  ContentAccessOption[]
> {
  const roles: PublicRole[] = await listRoles();
  return roles
    .filter((role) => role.enabled)
    .map((role) => ({
      id: role.key,
      label: role.label || role.key,
    }));
}
