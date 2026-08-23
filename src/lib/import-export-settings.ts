import { unstable_noStore as noStore } from "next/cache";
import { connectDb } from "@/lib/db";
import {
  autoVerifyImportExportSettings,
  directionIsConfigured,
} from "@/lib/import-export-auto-verify";
import {
  getDefaultConfiguredSecrets,
  getDefaultImportExportSettingsPublicForm,
  getDefaultSavedSettings,
  getDefaultVerifyState,
  type ImportExportDirectionSavedSettings,
  type ImportExportDirectionVerifyState,
  type ImportExportScheduleInterval,
  type ImportExportScheduleState,
  type ImportExportSettingsEditorData,
  type ImportExportSettingsPublicFormValues,
  type ImportExportSettingsSavedState,
  type ImportExportVerifyStatus,
  IMPORT_EXPORT_SCHEDULE_INTERVALS,
} from "@/lib/validations/import-export";
import {
  IMPORT_EXPORT_SETTINGS_KEY,
  ImportExportSettings,
  type ImportExportSettingsDocument,
} from "@/models/ImportExportSettings";

function toPublicFormValues(
  doc: ImportExportSettingsDocument,
): ImportExportSettingsPublicFormValues {
  const legacyGithub = doc.githubRepoUrl ?? "";
  const legacyCustom = doc.customUrl ?? "";

  return {
    importSource:
      doc.importSource === "custom_url" ? "custom_url" : "github",
    exportSource:
      doc.exportSource === "custom_url" ? "custom_url" : "github",
    importGithubRepoUrl: doc.importGithubRepoUrl || legacyGithub,
    importGithubBranch: doc.importGithubBranch ?? "",
    importGithubPath: doc.importGithubPath || doc.importGithubSyncPath || "",
    importGithubUsername: doc.importGithubUsername ?? "",
    importCustomUrl: doc.importCustomUrl || legacyCustom,
    importCustomUsername: doc.importCustomUsername ?? "",
    exportGithubRepoUrl: doc.exportGithubRepoUrl || legacyGithub,
    exportGithubBranch: doc.exportGithubBranch ?? "",
    exportGithubPath: doc.exportGithubPath || doc.exportGithubSyncPath || "",
    exportGithubUsername: doc.exportGithubUsername ?? "",
    exportCustomUrl: doc.exportCustomUrl || legacyCustom,
    exportCustomUsername: doc.exportCustomUsername ?? "",
  };
}

function toDirectionSavedSettings(
  doc: ImportExportSettingsDocument,
  direction: "import" | "export",
): ImportExportDirectionSavedSettings {
  const isImport = direction === "import";

  return {
    isConfigured: directionIsConfigured(doc, direction),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    source: isImport
      ? doc.importSource === "custom_url"
        ? "custom_url"
        : "github"
      : doc.exportSource === "custom_url"
        ? "custom_url"
        : "github",
    githubRepoUrl: isImport
      ? (doc.importGithubRepoUrl ?? "")
      : (doc.exportGithubRepoUrl ?? ""),
    githubBranch: isImport
      ? (doc.importGithubBranch ?? "")
      : (doc.exportGithubBranch ?? ""),
    githubPath: isImport
      ? (doc.importGithubPath || doc.importGithubSyncPath || "")
      : (doc.exportGithubPath || doc.exportGithubSyncPath || ""),
    githubUsername: isImport
      ? (doc.importGithubUsername ?? "")
      : (doc.exportGithubUsername ?? ""),
    customUrl: isImport ? (doc.importCustomUrl ?? "") : (doc.exportCustomUrl ?? ""),
    customUsername: isImport
      ? (doc.importCustomUsername ?? "")
      : (doc.exportCustomUsername ?? ""),
    githubPatConfigured: isImport
      ? Boolean(doc.importGithubPat)
      : Boolean(doc.exportGithubPat),
    customPasswordConfigured: isImport
      ? Boolean(doc.importCustomPassword)
      : Boolean(doc.exportCustomPassword),
  };
}

function normalizeScheduleInterval(value: unknown): ImportExportScheduleInterval {
  const n = Number(value);
  if ((IMPORT_EXPORT_SCHEDULE_INTERVALS as readonly number[]).includes(n)) {
    return n as ImportExportScheduleInterval;
  }
  return 60;
}

function toDirectionSchedule(
  doc: ImportExportSettingsDocument | null,
  direction: "import" | "export",
): ImportExportScheduleState {
  if (!doc) {
    return {
      enabled: false,
      intervalMinutes: 60,
      nextRunAt: null,
      lastRunAt: null,
    };
  }

  const isImport = direction === "import";
  const nextRaw = isImport ? doc.importScheduleNextRunAt : doc.exportScheduleNextRunAt;
  const lastRaw = isImport ? doc.importScheduleLastRunAt : doc.exportScheduleLastRunAt;

  return {
    enabled: isImport
      ? Boolean(doc.importScheduleEnabled)
      : Boolean(doc.exportScheduleEnabled),
    intervalMinutes: normalizeScheduleInterval(
      isImport ? doc.importScheduleIntervalMinutes : doc.exportScheduleIntervalMinutes,
    ),
    nextRunAt: nextRaw ? new Date(nextRaw).toISOString() : null,
    lastRunAt: lastRaw ? new Date(lastRaw).toISOString() : null,
  };
}

function toScheduleState(
  doc: ImportExportSettingsDocument | null,
): ImportExportSettingsEditorData["schedule"] {
  return {
    import: toDirectionSchedule(doc, "import"),
    export: toDirectionSchedule(doc, "export"),
  };
}

function toSavedSettings(
  doc: ImportExportSettingsDocument | null,
): ImportExportSettingsSavedState {
  if (!doc) return getDefaultSavedSettings();
  return {
    import: toDirectionSavedSettings(doc, "import"),
    export: toDirectionSavedSettings(doc, "export"),
  };
}

function toConfiguredSecrets(
  doc: ImportExportSettingsDocument | null,
): ImportExportSettingsEditorData["configuredSecrets"] {
  if (!doc) return getDefaultConfiguredSecrets();
  return {
    importGithubPat: Boolean(doc.importGithubPat),
    importCustomPassword: Boolean(doc.importCustomPassword),
    exportGithubPat: Boolean(doc.exportGithubPat),
    exportCustomPassword: Boolean(doc.exportCustomPassword),
  };
}

function normalizeVerifyStatus(
  value: string | null | undefined,
): ImportExportVerifyStatus {
  if (value === "verified" || value === "failed") return value;
  return "unknown";
}

function toDirectionVerifyState(
  doc: ImportExportSettingsDocument | null,
  direction: "import" | "export",
): ImportExportDirectionVerifyState {
  if (!doc) {
    return {
      status: "unknown",
      message: "",
      checkedAt: null,
    };
  }

  const status =
    direction === "import"
      ? normalizeVerifyStatus(doc.importVerifyStatus)
      : normalizeVerifyStatus(doc.exportVerifyStatus);
  const message =
    direction === "import"
      ? (doc.importVerifyMessage ?? "")
      : (doc.exportVerifyMessage ?? "");
  const checkedAtRaw =
    direction === "import" ? doc.importVerifiedAt : doc.exportVerifiedAt;

  return {
    status,
    message,
    checkedAt: checkedAtRaw ? new Date(checkedAtRaw).toISOString() : null,
  };
}

function toVerifyState(
  doc: ImportExportSettingsDocument | null,
): ImportExportSettingsEditorData["verifyState"] {
  if (!doc) return getDefaultVerifyState();
  return {
    import: toDirectionVerifyState(doc, "import"),
    export: toDirectionVerifyState(doc, "export"),
  };
}

export async function getImportExportSettingsEditorData(): Promise<ImportExportSettingsEditorData> {
  noStore();
  await connectDb();
  const doc = await ImportExportSettings.findOne({
    key: IMPORT_EXPORT_SETTINGS_KEY,
  }).lean<ImportExportSettingsDocument | null>();

  if (!doc) {
    return {
      form: getDefaultImportExportSettingsPublicForm(),
      configuredSecrets: getDefaultConfiguredSecrets(),
      verifyState: getDefaultVerifyState(),
      savedSettings: getDefaultSavedSettings(),
      schedule: toScheduleState(null),
    };
  }

  return {
    form: toPublicFormValues(doc),
    configuredSecrets: toConfiguredSecrets(doc),
    verifyState: toVerifyState(doc),
    savedSettings: toSavedSettings(doc),
    schedule: toScheduleState(doc),
  };
}

export async function refreshImportExportVerifyState(): Promise<
  ImportExportSettingsEditorData["verifyState"]
> {
  noStore();
  await connectDb();
  const doc = await ImportExportSettings.findOne({
    key: IMPORT_EXPORT_SETTINGS_KEY,
  }).lean<ImportExportSettingsDocument | null>();

  if (!doc) {
    return getDefaultVerifyState();
  }

  const verifiedDoc = await autoVerifyImportExportSettings(doc);
  return toVerifyState(verifiedDoc);
}
