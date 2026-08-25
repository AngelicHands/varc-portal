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
import { AdminFunctionSearch } from "@/components/admin/admin-function-search";
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
    <div
      data-admin-shell
      className="min-h-[100dvh] bg-[var(--admin-bg)] text-[var(--admin-ink)] lg:flex"
    >
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
        <header className="sticky top-0 z-20 hidden h-14 grid-cols-[1fr_minmax(0,28rem)_1fr] items-center gap-4 border-x-0 border-b border-t-0 border-gray-200 bg-white px-3 sm:px-4 lg:grid lg:px-6 xl:px-8">
          <div aria-hidden />
          <AdminFunctionSearch
            showEditorial={showEditorial}
            showImportExport={showImportExport}
            showPages={showPages}
            showSite={showSite}
            showUsers={showUsers}
            showRoles={showRoles}
          />
          <div className="flex justify-end">
            <AdminAccountMenu
              user={{
                name: session?.user?.name ?? null,
                email: session?.user?.email ?? null,
                callsign,
              }}
              signOutAction={signOutAction}
            />
          </div>
        </header>
        <div className="w-full min-w-0 overflow-x-clip px-3 py-5 sm:px-4 sm:py-8 lg:px-6 xl:px-8">
          {children}
        </div>
      </div>
      <AdminToaster />
    </div>
  );
}
