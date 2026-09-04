import { auth } from "@/auth";
import { canManageCallsigns, canManageSite } from "@/lib/roles";

export async function requireSiteAdminApi() {
  const session = await auth();
  if (!session?.user?.id || !canManageSite(session.user)) {
    return null;
  }
  return session;
}

export async function requireCallsignAdminApi() {
  const session = await auth();
  if (!session?.user?.id || !canManageCallsigns(session.user)) {
    return null;
  }
  return session;
}
