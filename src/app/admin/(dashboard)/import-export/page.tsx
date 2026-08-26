import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ImportExportSettingsEditor } from "@/components/admin/import-export-settings-editor";
import { requireImportExportPage } from "@/lib/admin-access";
import { getImportExportSettingsEditorData } from "@/lib/import-export-settings";
import type { ImportExportSettingsEditorData } from "@/lib/validations/import-export";

export const dynamic = "force-dynamic";

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

export default async function AdminImportExportPage({ searchParams }: Props) {
  await requireImportExportPage();
  await connection();

  const { tab } = await searchParams;
  // Jobs moved to Background Jobs — keep old links working.
  if (tab === "import" || tab === "export") {
    redirect(`/admin/background-jobs?tab=${tab}`);
  }

  const settingsData = await getImportExportSettingsEditorData();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Import/Export</h1>
      <p className="mt-2 text-sm text-gray-600">
        Configure GitHub sources and schedules. Run and monitor jobs under{" "}
        <Link
          href="/admin/background-jobs?tab=import"
          className="underline"
        >
          Background Jobs
        </Link>
        .
      </p>

      <div className="mt-8">
        <ImportExportSettingsEditor
          key={editorInstanceKey(settingsData)}
          initialData={settingsData}
        />
      </div>
    </div>
  );
}
