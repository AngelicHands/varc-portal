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

export type ExportGithubConfig = {
  repoUrl: string;
  branch: string;
  syncRoot: string;
  pat: string;
  username: string;
};

export async function loadExportGithubConfig(): Promise<ExportGithubConfig> {
  await connectDb();
  const doc = await ImportExportSettings.findOne({
    key: IMPORT_EXPORT_SETTINGS_KEY,
  }).lean<ImportExportSettingsDocument | null>();

  if (!doc) {
    throw new Error("Export is not configured. Save export settings first.");
  }

  if (doc.exportSource !== "github") {
    throw new Error("Only GitHub export is supported right now.");
  }

  if (!directionIsConfigured(doc, "export")) {
    throw new Error(
      "Export GitHub settings are incomplete. Configure and verify export settings.",
    );
  }

  if (doc.exportVerifyStatus !== "verified") {
    throw new Error(
      "Export connection is not verified. Verify export settings before running.",
    );
  }

  const pat = doc.exportGithubPat?.trim();
  if (!pat) {
    throw new Error("Export GitHub PAT is missing.");
  }

  return {
    repoUrl: normalizeGithubRepoUrl(doc.exportGithubRepoUrl ?? ""),
    branch: normalizeGithubBranch(doc.exportGithubBranch ?? "") || "main",
    syncRoot: normalizeSyncRootPath(
      normalizeGithubPath(doc.exportGithubPath || doc.exportGithubSyncPath || ""),
    ),
    pat,
    username: doc.exportGithubUsername?.trim() ?? "",
  };
}

export type ExportSettingsSummary = {
  isConfigured: boolean;
  isVerified: boolean;
  source: "github" | "custom_url";
  repoUrl: string;
  branch: string;
  syncRoot: string;
};

export async function getExportSettingsSummary(): Promise<ExportSettingsSummary> {
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

  const source = doc.exportSource === "custom_url" ? "custom_url" : "github";

  return {
    isConfigured: directionIsConfigured(doc, "export"),
    isVerified: doc.exportVerifyStatus === "verified",
    source,
    repoUrl: doc.exportGithubRepoUrl ?? "",
    branch: doc.exportGithubBranch ?? "",
    syncRoot: normalizeSyncRootPath(
      normalizeGithubPath(doc.exportGithubPath || doc.exportGithubSyncPath || ""),
    ),
  };
}
