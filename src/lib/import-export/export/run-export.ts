import { buildCmsExportFiles } from "@/lib/import-export/export/build-export-files";
import { loadExportGithubConfig } from "@/lib/import-export/export/load-export-config";
import {
  commitGitHubFiles,
  resolveExportBranchFromGithub,
  resolveOwnerRepo,
} from "@/lib/import-export/github-client";

export type CmsExportRunResult = {
  commitSha: string;
  htmlUrl: string;
  stats: {
    categories: number;
    articles: number;
    mediaFiles: number;
    markdownFiles: number;
    totalFiles: number;
  };
};

export async function runCmsExportToGithub(): Promise<CmsExportRunResult> {
  const config = await loadExportGithubConfig();
  const ownerRepo = resolveOwnerRepo(config.repoUrl);
  const branch = await resolveExportBranchFromGithub({
    ownerRepo,
    pat: config.pat,
    branch: config.branch,
  });

  const built = await buildCmsExportFiles(config.syncRoot);

  const message = [
    "cms-export:",
    `${built.stats.categories} categories,`,
    `${built.stats.articles} articles,`,
    `${built.stats.mediaFiles} media files`,
  ].join(" ");

  const committed = await commitGitHubFiles({
    ownerRepo,
    branch,
    pat: config.pat,
    message,
    files: built.files,
  });

  return {
    commitSha: committed.commitSha,
    htmlUrl: committed.htmlUrl,
    stats: {
      ...built.stats,
      totalFiles: built.files.length,
    },
  };
}
