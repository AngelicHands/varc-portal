import { connectDb } from "@/lib/db";
import { directionIsConfigured } from "@/lib/import-export-auto-verify";
import { normalizeGithubBranch, normalizeGithubPath } from "@/lib/validations/import-export";
import {
  IMPORT_EXPORT_SETTINGS_KEY,
  ImportExportSettings,
  type ImportExportSettingsDocument,
} from "@/models/ImportExportSettings";
import { normalizeGithubRepoUrl } from "@/lib/import-export-verify";
import { normalizeSyncRootPath } from "@/lib/import-export/sync-paths";

export type ImportGithubConfig = {
  repoUrl: string;
  branch: string;
  syncRoot: string;
  pat: string;
  username: string;
};

export async function loadImportGithubConfig(): Promise<ImportGithubConfig> {
  await connectDb();
  const doc = await ImportExportSettings.findOne({
    key: IMPORT_EXPORT_SETTINGS_KEY,
  }).lean<ImportExportSettingsDocument | null>();

  if (!doc) {
    throw new Error("Import is not configured. Save import settings first.");
  }

  if (doc.importSource !== "github") {
    throw new Error("Only GitHub import is supported right now.");
  }

  if (!directionIsConfigured(doc, "import")) {
    throw new Error(
      "Import GitHub settings are incomplete. Configure and verify import settings.",
    );
  }

  if (doc.importVerifyStatus !== "verified") {
    throw new Error(
      "Import connection is not verified. Verify import settings before running.",
    );
  }

  const pat = doc.importGithubPat?.trim();
  if (!pat) {
    throw new Error("Import GitHub PAT is missing.");
  }

  return {
    repoUrl: normalizeGithubRepoUrl(doc.importGithubRepoUrl ?? ""),
    branch: normalizeGithubBranch(doc.importGithubBranch ?? "") || "main",
    syncRoot: normalizeSyncRootPath(
      normalizeGithubPath(doc.importGithubPath || doc.importGithubSyncPath || ""),
    ),
    pat,
    username: doc.importGithubUsername?.trim() ?? "",
  };
}

export type ImportSettingsSummary = {
  isConfigured: boolean;
  isVerified: boolean;
  source: "github" | "custom_url";
  repoUrl: string;
  branch: string;
  syncRoot: string;
};

export async function getImportSettingsSummary(): Promise<ImportSettingsSummary> {
  await connectDb();
  const doc = await ImportExportSettings.findOne({
    key: IMPORT_EXPORT_SETTINGS_KEY,
  }).lean<ImportExportSettingsDocument | null>();

  if (!doc) {
    return {
      isConfigured: false,
      isVerified: false,
      source: "github",
      repoUrl: "",
      branch: "",
      syncRoot: "",
    };
  }

  const source = doc.importSource === "custom_url" ? "custom_url" : "github";

  return {
    isConfigured: directionIsConfigured(doc, "import"),
    isVerified: doc.importVerifyStatus === "verified",
    source,
    repoUrl: doc.importGithubRepoUrl ?? "",
    branch: doc.importGithubBranch ?? "",
    syncRoot: normalizeSyncRootPath(
      normalizeGithubPath(doc.importGithubPath || doc.importGithubSyncPath || ""),
    ),
  };
}
