import { requireSitePage } from "@/lib/admin-access";
import { getBackupAdminSummary } from "@/lib/backup/admin";
import { AdminRouteTabs } from "@/components/admin/admin-route-tabs";
import { BackupManager } from "@/components/admin/backup-manager";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "settings", label: "Settings", href: "/admin/backup" },
  { id: "jobs", label: "Jobs", href: "/admin/backup?tab=jobs" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

function resolveTab(tab: string | undefined): TabId {
  return tab === "jobs" ? "jobs" : "settings";
}

export default async function AdminBackupPage({ searchParams }: Props) {
  await requireSitePage();
  const { tab } = await searchParams;
  const activeTab = resolveTab(tab);
  const summary = await getBackupAdminSummary();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Backup</h1>
      <p className="mt-2 text-sm text-gray-600">
        {activeTab === "jobs"
          ? "Track backup and restore jobs, download finished ZIP archives, and cancel or delete jobs."
          : "Create background backup jobs, download finished ZIP archives, and restore the portal from an uploaded file or remote link."}
      </p>

      <AdminRouteTabs tabs={[...TABS]} active={activeTab} />

      <div className="mt-8">
        <BackupManager
          view={activeTab}
          initialJobs={summary.jobs}
          estimatedBytes={summary.estimatedBytes}
          uniqueMediaFiles={summary.uniqueMediaFiles}
          uploadLimitBytes={summary.uploadLimitBytes}
        />
      </div>
    </div>
  );
}
