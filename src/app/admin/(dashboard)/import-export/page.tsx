import { connection } from "next/server";
import { AdminRouteTabs } from "@/components/admin/admin-route-tabs";
import { ImportExportJobsPanel } from "@/components/admin/import-export-jobs-panel";
import { ImportExportSettingsEditor } from "@/components/admin/import-export-settings-editor";
import { requireImportExportPage } from "@/lib/admin-access";
import { getExportSettingsSummary } from "@/lib/import-export/export/load-export-config";
import { getImportSettingsSummary } from "@/lib/import-export/import/load-import-config";
import {
  IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
  listImportExportJobsPage,
} from "@/lib/import-export/jobs";
import { getImportExportSettingsEditorData } from "@/lib/import-export-settings";
import type { ImportExportSettingsEditorData } from "@/lib/validations/import-export";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "settings", label: "Settings", href: "/admin/import-export" },
  {
    id: "import",
    label: "Import Jobs",
    href: "/admin/import-export?tab=import",
  },
  {
    id: "export",
    label: "Export Jobs",
    href: "/admin/import-export?tab=export",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

function editorInstanceKey(data: ImportExportSettingsEditorData): string {
  return [
    data.savedSettings.import.updatedAt ?? "",
    data.savedSettings.export.updatedAt ?? "",
    data.savedSettings.import.isConfigured ? "1" : "0",
    data.savedSettings.export.isConfigured ? "1" : "0",
    data.schedule.import.enabled ? "1" : "0",
    data.schedule.export.enabled ? "1" : "0",
    data.schedule.import.intervalMinutes,
    data.schedule.export.intervalMinutes,
  ].join(":");
}

function resolveTab(tab: string | undefined): TabId {
  if (tab === "import" || tab === "export") return tab;
  return "settings";
}

export default async function AdminImportExportPage({ searchParams }: Props) {
  await requireImportExportPage();
  await connection();

  const { tab } = await searchParams;
  const activeTab = resolveTab(tab);
  const settingsData =
    activeTab === "settings"
      ? await getImportExportSettingsEditorData()
      : null;
  const exportSettings =
    activeTab === "export" ? await getExportSettingsSummary() : null;
  const importSettings =
    activeTab === "import" ? await getImportSettingsSummary() : null;
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
      <h1 className="text-2xl font-semibold">Import/Export</h1>

      <AdminRouteTabs tabs={[...TABS]} active={activeTab} />

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

      {activeTab === "settings" && settingsData ? (
        <ImportExportSettingsEditor
          key={editorInstanceKey(settingsData)}
          initialData={settingsData}
        />
      ) : null}
    </div>
  );
}
