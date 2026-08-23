import { connectDb } from "@/lib/db";
import { verifyImportExportSource } from "@/lib/import-export-verify";
import type { ImportExportDirectionVerifyState } from "@/lib/validations/import-export";
import {
  IMPORT_EXPORT_SETTINGS_KEY,
  ImportExportSettings,
  type ImportExportSettingsDocument,
} from "@/models/ImportExportSettings";

function directionIsConfigured(
  doc: ImportExportSettingsDocument,
  direction: "import" | "export",
): boolean {
  if (direction === "import") {
    if (doc.importSource === "custom_url") {
      return Boolean(
        doc.importCustomUrl &&
          doc.importCustomUsername &&
          doc.importCustomPassword,
      );
    }
    return Boolean(
      doc.importGithubRepoUrl &&
        doc.importGithubUsername &&
        doc.importGithubPat,
    );
  }

  if (doc.exportSource === "custom_url") {
    return Boolean(
      doc.exportCustomUrl &&
        doc.exportCustomUsername &&
        doc.exportCustomPassword,
    );
  }
  return Boolean(
    doc.exportGithubRepoUrl &&
      doc.exportGithubUsername &&
      doc.exportGithubPat,
  );
}

async function verifyDirectionFromDocument(
  doc: ImportExportSettingsDocument,
  direction: "import" | "export",
): Promise<{
  verify: ImportExportDirectionVerifyState;
  update: Record<string, unknown>;
} | null> {
  if (!directionIsConfigured(doc, direction)) {
    return null;
  }

  const isImport = direction === "import";
  const source =
    (isImport ? doc.importSource : doc.exportSource) === "custom_url"
      ? "custom_url"
      : "github";

  const result = await verifyImportExportSource({
    source,
    githubRepoUrl: isImport
      ? (doc.importGithubRepoUrl ?? "")
      : (doc.exportGithubRepoUrl ?? ""),
    githubUsername: isImport
      ? (doc.importGithubUsername ?? "")
      : (doc.exportGithubUsername ?? ""),
    githubPat: isImport
      ? (doc.importGithubPat ?? "")
      : (doc.exportGithubPat ?? ""),
    githubBranch: isImport
      ? (doc.importGithubBranch ?? "")
      : (doc.exportGithubBranch ?? ""),
    githubPath: isImport
      ? (doc.importGithubPath || doc.importGithubSyncPath || "")
      : (doc.exportGithubPath || doc.exportGithubSyncPath || ""),
    customUrl: isImport ? (doc.importCustomUrl ?? "") : (doc.exportCustomUrl ?? ""),
    customUsername: isImport
      ? (doc.importCustomUsername ?? "")
      : (doc.exportCustomUsername ?? ""),
    customPassword: isImport
      ? (doc.importCustomPassword ?? "")
      : (doc.exportCustomPassword ?? ""),
  });

  const checkedAt = new Date();
  const verify: ImportExportDirectionVerifyState = result.ok
    ? { status: "verified", message: "", checkedAt: checkedAt.toISOString() }
    : {
        status: "failed",
        message: result.error,
        checkedAt: checkedAt.toISOString(),
      };

  const prefix = isImport ? "import" : "export";

  return {
    verify,
    update: {
      [`${prefix}VerifyStatus`]: verify.status,
      [`${prefix}VerifyMessage`]: verify.message,
      [`${prefix}VerifiedAt`]: checkedAt,
    },
  };
}

export async function autoVerifyImportExportSettings(
  doc: ImportExportSettingsDocument,
): Promise<ImportExportSettingsDocument> {
  const updates: Record<string, unknown> = {};

  const importResult = await verifyDirectionFromDocument(doc, "import");
  if (importResult) {
    Object.assign(updates, importResult.update);
  }

  const exportResult = await verifyDirectionFromDocument(doc, "export");
  if (exportResult) {
    Object.assign(updates, exportResult.update);
  }

  if (Object.keys(updates).length === 0) {
    return doc;
  }

  const updated = await ImportExportSettings.findOneAndUpdate(
    { key: IMPORT_EXPORT_SETTINGS_KEY },
    { $set: updates },
    { returnDocument: "after" },
  ).lean<ImportExportSettingsDocument | null>();

  return updated ?? doc;
}

export async function runImportExportStartupVerification(): Promise<void> {
  try {
    await connectDb();
    const doc = await ImportExportSettings.findOne({
      key: IMPORT_EXPORT_SETTINGS_KEY,
    }).lean<ImportExportSettingsDocument | null>();

    if (!doc) return;

    await autoVerifyImportExportSettings(doc);
  } catch (error) {
    console.error("[import-export] Startup verification failed:", error);
  }
}

export { directionIsConfigured };
