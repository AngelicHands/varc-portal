import { UsersManager } from "@/components/admin/users-manager";
import { requireUsersPage } from "@/lib/admin-access";
import { listAssignableRoles } from "@/lib/app-roles";
import { connectDb } from "@/lib/db";
import {
  assignableRolesForActor,
  canChangeUserRole,
  canManageUsers,
  isSystemAdmin,
  normalizeRoleKey,
} from "@/lib/roles";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireUsersPage();

  const actorRole = session.user.role;
  const actorUserId = session.user.id ?? "";
  const canManage = canManageUsers(session.user);
  const canCreate = isSystemAdmin(actorRole);
  const allRoles = await listAssignableRoles();
  const rolesForActor = assignableRolesForActor(actorRole, allRoles);

  await connectDb();
  const users = await User.find().sort({ createdAt: -1 }).lean();

  const initialUsers = users.map((user) => {
    const roleKey = normalizeRoleKey(user.role);
    const userId = String(user._id);
    return {
      id: userId,
      name: user.name,
      email: user.email,
      callsign: user.callsign?.trim() ?? "",
      callsignVerified: Boolean(user.callsignVerified),
      role: roleKey,
      createdAt:
        user.createdAt instanceof Date
          ? user.createdAt.toISOString()
          : String(user.createdAt ?? ""),
      editable:
        canManage &&
        canChangeUserRole({
          actorRole,
          actorUserId,
          targetUserId: userId,
          targetCurrentRole: roleKey,
        }),
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-2 text-sm text-gray-600">
        {canManage
          ? isSystemAdmin(actorRole)
            ? "Create accounts and assign any role."
            : "Assign roles for users other than yourself and Setup Admins."
          : "View registered users. You cannot change roles."}
      </p>

      <UsersManager
        initialUsers={initialUsers}
        allRoles={allRoles}
        rolesForActor={rolesForActor}
        canCreate={canCreate}
        canManage={canManage}
      />
    </div>
  );
}
