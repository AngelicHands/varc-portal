import { auth, signOut } from "@/auth";
import {
  canManageEditorial,
  canManageImportExport,
  canManagePages,
  canManageRoles,
  canManageSite,
  canManageUsers,
} from "@/lib/roles";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminAccountMenu } from "@/components/admin/admin-account-menu";
import { AdminToaster } from "@/components/admin/admin-toast";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;
  // Prefer session JWT callsign — avoid a Mongo round-trip on every admin nav.
  const callsign = user?.callsign?.trim() ?? "";
  const showEditorial = canManageEditorial(user);
  const showImportExport = canManageImportExport(user);
  const showPages = canManagePages(user);
  const showSite = canManageSite(user);
  const showUsers = canManageUsers(user);
  const showRoles = canManageRoles(user);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--admin-bg)] text-[var(--admin-ink)] lg:flex">
      <AdminSidebar
        showEditorial={showEditorial}
        showImportExport={showImportExport}
        showPages={showPages}
        showSite={showSite}
        showUsers={showUsers}
        showRoles={showRoles}
        userName={session?.user?.name}
        userEmail={session?.user?.email}
        userCallsign={callsign}
        signOutAction={signOutAction}
      />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-end border-b border-gray-200 bg-white px-3 sm:px-4 lg:flex lg:px-6 xl:px-8">
          <AdminAccountMenu
            user={{
              name: session?.user?.name ?? null,
              email: session?.user?.email ?? null,
              callsign,
            }}
            signOutAction={signOutAction}
          />
        </header>
        <div className="w-full min-w-0 overflow-x-clip px-3 py-5 sm:px-4 sm:py-8 lg:px-6 xl:px-8">
          {children}
        </div>
      </div>
      <AdminToaster />
    </div>
  );
}
