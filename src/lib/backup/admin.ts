import {
  hasActiveBackupJob,
  listBackupJobsPage,
  type AdminBackupJob,
  type BackupJobsPage,
} from "@/lib/backup/jobs";
import { Media } from "@/models/Media";
import { FormSubmission } from "@/models/FormSubmission";
import { connectDb } from "@/lib/db";
import { ADMIN_JOBS_DEFAULT_PAGE_SIZE } from "@/lib/admin-jobs-pagination";
import { isFormUploadValue } from "@/lib/validations/forms";

export type BackupAdminSummary = {
  jobs: AdminBackupJob[];
  jobsPage: BackupJobsPage;
  hasActive: boolean;
  estimatedBytes: number;
  uniqueMediaFiles: number;
  uploadLimitBytes: number;
};

export async function getBackupAdminSummary(options?: {
  page?: number;
  pageSize?: number;
}): Promise<BackupAdminSummary> {
  await connectDb();
  const [jobsPage, hasActive, mediaDocs, formDocs] = await Promise.all([
    listBackupJobsPage(
      options?.page ?? 1,
      options?.pageSize ?? ADMIN_JOBS_DEFAULT_PAGE_SIZE,
    ),
    hasActiveBackupJob(),
    Media.find({}, { key: 1, size: 1 }).lean(),
    FormSubmission.find({}, { payload: 1 }).lean(),
  ]);

  const sizes = new Map<string, number>();
  for (const doc of mediaDocs) {
    const key = String(doc.key || "").trim();
    if (!key) continue;
    sizes.set(key, Number(doc.size || 0));
  }

  for (const doc of formDocs) {
    if (!doc.payload || typeof doc.payload !== "object") continue;
    for (const value of Object.values(doc.payload as Record<string, unknown>)) {
      if (!isFormUploadValue(value)) continue;
      if (!sizes.has(value.key)) {
        sizes.set(value.key, value.size || 0);
      }
    }
  }

  return {
    jobs: jobsPage.jobs,
    jobsPage,
    hasActive,
    estimatedBytes: [...sizes.values()].reduce((sum, size) => sum + size, 0),
    uniqueMediaFiles: sizes.size,
    uploadLimitBytes: Number(process.env.BACKUP_RESTORE_UPLOAD_MAX_BYTES || 536870912),
  };
}
