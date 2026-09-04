import Link from "next/link";
import { redirect } from "next/navigation";
import { BackupManager } from "@/components/admin/backup-manager";
import { requireSitePage } from "@/lib/admin-access";
import { getBackupAdminSummary } from "@/lib/backup/admin";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function AdminBackupPage({ searchParams }: Props) {
  await requireSitePage();

  const { tab } = await searchParams;
  // Jobs moved to Background Jobs — keep old links working.
  if (tab === "jobs") {
    redirect("/admin/background-jobs?tab=backup");
  }

  const summary = await getBackupAdminSummary();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Backup</h1>
      <p className="mt-2 text-sm text-gray-600">
        Create background backup jobs and restore the portal from an uploaded
        file or remote link. Monitor jobs under{" "}
        <Link
          href="/admin/background-jobs?tab=backup"
          className="underline"
        >
          Background Jobs
        </Link>
        .
      </p>

      <div className="mt-8">
        <BackupManager
          view="settings"
          initialJobsPage={summary.jobsPage}
          initialHasActive={summary.hasActive}
          estimatedBytes={summary.estimatedBytes}
          uniqueMediaFiles={summary.uniqueMediaFiles}
          uploadLimitBytes={summary.uploadLimitBytes}
        />
      </div>
    </div>
  );
}
