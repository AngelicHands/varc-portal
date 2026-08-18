import { auth } from "@/auth";
import { canManageSite } from "@/lib/roles";

export async function requireSiteAdminApi() {
  const session = await auth();
  if (!session?.user?.id || !canManageSite(session.user.role)) {
    return null;
  }
  return session;
}
