import { requireSitePage } from "@/lib/admin-access";
import { getBackupAdminSummary } from "@/lib/backup/admin";
import { BackupManager } from "@/components/admin/backup-manager";

export const dynamic = "force-dynamic";

export default async function AdminBackupPage() {
  await requireSitePage();
  const summary = await getBackupAdminSummary();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Backup</h1>
      <p className="mt-2 text-sm text-gray-600">
        Create background backup jobs, download finished ZIP archives, and restore
        the portal from an uploaded file or remote link.
      </p>

      <div className="mt-8">
        <BackupManager
          initialJobs={summary.jobs}
          estimatedBytes={summary.estimatedBytes}
          uniqueMediaFiles={summary.uniqueMediaFiles}
          uploadLimitBytes={summary.uploadLimitBytes}
        />
      </div>
    </div>
  );
}
