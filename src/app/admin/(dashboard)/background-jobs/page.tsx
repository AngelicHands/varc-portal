import { redirect } from "next/navigation";
import { AdminRouteTabs } from "@/components/admin/admin-route-tabs";
import { BackupManager } from "@/components/admin/backup-manager";
import { HlsPosterJobsManager } from "@/components/admin/hls-poster-jobs-manager";
import { ImportExportJobsPanel } from "@/components/admin/import-export-jobs-panel";
import { requireAdminPage } from "@/lib/admin-access";
import { getBackupAdminSummary } from "@/lib/backup/admin";
import {
  hasActiveHlsPosterJob,
  listHlsPosterJobsPage,
} from "@/lib/hls-poster/jobs";
import { getExportSettingsSummary } from "@/lib/import-export/export/load-export-config";
import { getImportSettingsSummary } from "@/lib/import-export/import/load-import-config";
import {
  IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
  listImportExportJobsPage,
} from "@/lib/import-export/jobs";
import {
  canManageImportExport,
  canManageSite,
} from "@/lib/roles";

export const dynamic = "force-dynamic";

type TabId = "hls-poster" | "backup" | "import" | "export";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

function buildTabs(opts: { showSite: boolean; showImportExport: boolean }) {
  const tabs: Array<{ id: TabId; label: string; href: string }> = [];
  if (opts.showSite) {
    tabs.push(
      {
        id: "hls-poster",
        label: "HLS poster",
        href: "/admin/background-jobs",
      },
      {
        id: "backup",
        label: "Backup",
        href: "/admin/background-jobs?tab=backup",
      },
    );
  }
  if (opts.showImportExport) {
    tabs.push(
      {
        id: "import",
        label: "Import",
        href: "/admin/background-jobs?tab=import",
      },
      {
        id: "export",
        label: "Export",
        href: "/admin/background-jobs?tab=export",
      },
    );
  }
  return tabs;
}

function resolveTab(
  tab: string | undefined,
  tabs: Array<{ id: TabId }>,
): TabId | null {
  if (tabs.length === 0) return null;
  if (
    tab === "import" ||
    tab === "export" ||
    tab === "hls-poster" ||
    tab === "backup"
  ) {
    if (tabs.some((item) => item.id === tab)) return tab;
  }
  return tabs[0].id;
}

export default async function AdminBackgroundJobsPage({ searchParams }: Props) {
  const session = await requireAdminPage();
  const showSite = canManageSite(session.user);
  const showImportExport = canManageImportExport(session.user);
  if (!showSite && !showImportExport) {
    redirect("/admin");
  }

  const { tab } = await searchParams;
  const tabs = buildTabs({ showSite, showImportExport });
  const activeTab = resolveTab(tab, tabs);
  if (!activeTab) {
    redirect("/admin");
  }

  const [hlsJobsPage, hlsHasActive] =
    activeTab === "hls-poster"
      ? await Promise.all([listHlsPosterJobsPage(), hasActiveHlsPosterJob()])
      : [null, false];
  const backupSummary =
    activeTab === "backup" ? await getBackupAdminSummary() : null;
  const importSettings =
    activeTab === "import" ? await getImportSettingsSummary() : null;
  const exportSettings =
    activeTab === "export" ? await getExportSettingsSummary() : null;
  const importJobsPage =
    activeTab === "import"
      ? await listImportExportJobsPage(
          "import",
          1,
          IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
        )
      : null;
  const exportJobsPage =
    activeTab === "export"
      ? await listImportExportJobsPage(
          "export",
          1,
          IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
        )
      : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Background Jobs</h1>
      <p className="mt-2 text-sm text-gray-600">
        Queue and monitor background workers for HLS posters, backup/restore,
        and content import/export.
      </p>

      <AdminRouteTabs tabs={tabs} active={activeTab} />

      <div className="mt-8">
        {activeTab === "hls-poster" && hlsJobsPage ? (
          <HlsPosterJobsManager
            initialJobsPage={hlsJobsPage}
            initialHasActive={hlsHasActive}
          />
        ) : null}

        {activeTab === "backup" && backupSummary ? (
          <BackupManager
            view="jobs"
            initialJobsPage={backupSummary.jobsPage}
            initialHasActive={backupSummary.hasActive}
            estimatedBytes={backupSummary.estimatedBytes}
            uniqueMediaFiles={backupSummary.uniqueMediaFiles}
            uploadLimitBytes={backupSummary.uploadLimitBytes}
          />
        ) : null}

        {activeTab === "import" && importSettings && importJobsPage ? (
          <ImportExportJobsPanel
            key="import-jobs"
            kind="import"
            settings={importSettings}
            initialPage={importJobsPage}
          />
        ) : null}

        {activeTab === "export" && exportSettings && exportJobsPage ? (
          <ImportExportJobsPanel
            key="export-jobs"
            kind="export"
            settings={exportSettings}
            initialPage={exportJobsPage}
          />
        ) : null}
      </div>
    </div>
  );
}
