import { redirect } from "next/navigation";
import { AdminRouteTabs } from "@/components/admin/admin-route-tabs";
import { HlsPosterJobsManager } from "@/components/admin/hls-poster-jobs-manager";
import { ImportExportJobsPanel } from "@/components/admin/import-export-jobs-panel";
import { requireAdminPage } from "@/lib/admin-access";
import { listHlsPosterJobs } from "@/lib/hls-poster/jobs";
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

type TabId = "hls-poster" | "import" | "export";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

function buildTabs(opts: { showHls: boolean; showImportExport: boolean }) {
  const tabs: Array<{ id: TabId; label: string; href: string }> = [];
  if (opts.showHls) {
    tabs.push({
      id: "hls-poster",
      label: "HLS poster",
      href: "/admin/background-jobs",
    });
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
  if (tab === "import" || tab === "export" || tab === "hls-poster") {
    if (tabs.some((item) => item.id === tab)) return tab;
  }
  return tabs[0].id;
}

export default async function AdminBackgroundJobsPage({ searchParams }: Props) {
  const session = await requireAdminPage();
  const showHls = canManageSite(session.user);
  const showImportExport = canManageImportExport(session.user);
  if (!showHls && !showImportExport) {
    redirect("/admin");
  }

  const { tab } = await searchParams;
  const tabs = buildTabs({ showHls, showImportExport });
  const activeTab = resolveTab(tab, tabs);
  if (!activeTab) {
    redirect("/admin");
  }

  const jobs = activeTab === "hls-poster" ? await listHlsPosterJobs() : null;
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
        Queue and monitor background workers for HLS posters and content
        import/export.
      </p>

      <AdminRouteTabs tabs={tabs} active={activeTab} />

      <div className="mt-8">
        {activeTab === "hls-poster" && jobs ? (
          <HlsPosterJobsManager initialJobs={jobs} />
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
