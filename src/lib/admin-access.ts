import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  canManageEditorial,
  canManageImportExport,
  canManageCallsigns,
  canManagePages,
  canManageSite,
  canManageUsers,
  canManageRoles,
  isAdminRole,
} from "@/lib/roles";

export async function requireAdminPage() {
  const session = await auth();
  if (!session?.user?.id || !isAdminRole(session.user)) {
    redirect("/admin/login");
  }
  return session;
}

export async function requireEditorialPage() {
  const session = await requireAdminPage();
  if (!canManageEditorial(session.user)) {
    redirect("/admin");
  }
  return session;
}

export async function requireImportExportPage() {
  const session = await requireAdminPage();
  if (!canManageImportExport(session.user)) {
    redirect("/admin");
  }
  return session;
}

export async function requireCallsignsPage() {
  const session = await requireAdminPage();
  if (!canManageCallsigns(session.user)) {
    redirect("/admin");
  }
  return session;
}

export async function requirePagesPage() {
  const session = await requireAdminPage();
  if (!canManagePages(session.user)) {
    redirect("/admin");
  }
  return session;
}

export async function requireSitePage() {
  const session = await requireAdminPage();
  if (!canManageSite(session.user)) {
    redirect("/admin");
  }
  return session;
}

export async function requireUsersPage() {
  const session = await requireAdminPage();
  if (!canManageUsers(session.user)) {
    redirect("/admin");
  }
  return session;
}

export async function requireRolesPage() {
  const session = await requireAdminPage();
  if (!canManageRoles(session.user)) {
    redirect("/admin");
  }
  return session;
}
