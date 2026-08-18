import { listBackupJobs, type AdminBackupJob } from "@/lib/backup/jobs";
import { Media } from "@/models/Media";
import { FormSubmission } from "@/models/FormSubmission";
import { connectDb } from "@/lib/db";
import { isFormUploadValue } from "@/lib/validations/forms";

export type BackupAdminSummary = {
  jobs: AdminBackupJob[];
  estimatedBytes: number;
  uniqueMediaFiles: number;
  uploadLimitBytes: number;
};

export async function getBackupAdminSummary(): Promise<BackupAdminSummary> {
  await connectDb();
  const [jobs, mediaDocs, formDocs] = await Promise.all([
    listBackupJobs(),
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
    jobs,
    estimatedBytes: [...sizes.values()].reduce((sum, size) => sum + size, 0),
    uniqueMediaFiles: sizes.size,
    uploadLimitBytes: Number(process.env.BACKUP_RESTORE_UPLOAD_MAX_BYTES || 536870912),
  };
}
