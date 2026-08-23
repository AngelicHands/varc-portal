import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { CmsCacheTags, invalidateCmsTags } from "@/lib/cache/cms-cache";
import { runCmsExportToGithub } from "@/lib/import-export/export/run-export";
import { runCmsImportFromGithub } from "@/lib/import-export/import/run-import";
import {
  getImportExportJobDocument,
  markImportExportJobFailed,
  markImportExportJobSucceeded,
  updateImportExportJobProgress,
} from "@/lib/import-export/jobs";
import type { ImportExportJobDocument } from "@/models/ImportExportJob";
import { User } from "@/models/User";

async function resolveImportFallbackUserId(
  job: ImportExportJobDocument,
): Promise<string> {
  if (job.requestedByUserId) {
    return String(job.requestedByUserId);
  }
  await connectDb();
  const admin = await User.findOne({
    role: { $in: ["setup_admin", "administrator"] },
  })
    .sort({ createdAt: 1 })
    .lean();
  if (admin?._id) {
    return String(admin._id);
  }
  throw new Error("No administrator user available for scheduled import");
}

export async function executeImportExportJob(jobId: string): Promise<void> {
  const job = await getImportExportJobDocument(jobId);
  if (!job) {
    throw new Error("Job not found");
  }
  if (job.status !== "running") {
    throw new Error("Job is not running");
  }

  try {
    await updateImportExportJobProgress(jobId, {
      phase: "syncing",
      message: job.kind === "import" ? "Importing from GitHub" : "Exporting to GitHub",
    });

    if (job.kind === "import") {
      const result = await runCmsImportFromGithub({
        fallbackUserId: await resolveImportFallbackUserId(job),
      });
      await markImportExportJobSucceeded(jobId, {
        message: "Import completed",
        stats: result.stats,
      });
      await invalidateCmsTags(
        CmsCacheTags.branding,
        CmsCacheTags.settings,
        CmsCacheTags.menus,
        CmsCacheTags.pages,
        CmsCacheTags.articles,
        CmsCacheTags.categories,
        CmsCacheTags.forms,
        CmsCacheTags.templates,
      );
      revalidatePath("/admin/import-export", "page");
      revalidatePath("/admin/articles", "page");
      revalidatePath("/admin/categories", "page");
      return;
    }

    const result = await runCmsExportToGithub();
    await markImportExportJobSucceeded(jobId, {
      message: "Export committed to GitHub",
      stats: result.stats,
      commitSha: result.commitSha,
      htmlUrl: result.htmlUrl,
    });
    revalidatePath("/admin/import-export", "page");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    await markImportExportJobFailed(jobId, message);
    throw error;
  }
}
