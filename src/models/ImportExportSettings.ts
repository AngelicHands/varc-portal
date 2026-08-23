import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ImportExportSettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    importSource: {
      type: String,
      enum: ["github", "custom_url"],
      default: "github",
    },
    exportSource: {
      type: String,
      enum: ["github", "custom_url"],
      default: "github",
    },
    importGithubRepoUrl: { type: String, default: "" },
    importGithubBranch: { type: String, default: "" },
    importGithubPath: { type: String, default: "" },
    importGithubUsername: { type: String, default: "" },
    importGithubPat: { type: String, default: "" },
    importCustomUrl: { type: String, default: "" },
    importCustomUsername: { type: String, default: "" },
    importCustomPassword: { type: String, default: "" },
    exportGithubRepoUrl: { type: String, default: "" },
    exportGithubBranch: { type: String, default: "" },
    exportGithubPath: { type: String, default: "" },
    exportGithubUsername: { type: String, default: "" },
    exportGithubPat: { type: String, default: "" },
    /** @deprecated Migrated to importGithubPath on read */
    importGithubSyncPath: { type: String, default: "" },
    /** @deprecated Migrated to exportGithubPath on read */
    exportGithubSyncPath: { type: String, default: "" },
    exportCustomUrl: { type: String, default: "" },
    exportCustomUsername: { type: String, default: "" },
    exportCustomPassword: { type: String, default: "" },
    /** @deprecated Legacy shared fields — migrated on read */
    githubRepoUrl: { type: String, default: "" },
    customUrl: { type: String, default: "" },
    importVerifyStatus: {
      type: String,
      enum: ["unknown", "verified", "failed"],
      default: "unknown",
    },
    importVerifyMessage: { type: String, default: "" },
    importVerifiedAt: { type: Date, default: null },
    exportVerifyStatus: {
      type: String,
      enum: ["unknown", "verified", "failed"],
      default: "unknown",
    },
    exportVerifyMessage: { type: String, default: "" },
    exportVerifiedAt: { type: Date, default: null },
    importScheduleEnabled: { type: Boolean, default: false },
    importScheduleIntervalMinutes: { type: Number, default: 60 },
    importScheduleNextRunAt: { type: Date, default: null, index: true },
    importScheduleLastRunAt: { type: Date, default: null },
    exportScheduleEnabled: { type: Boolean, default: false },
    exportScheduleIntervalMinutes: { type: Number, default: 60 },
    exportScheduleNextRunAt: { type: Date, default: null, index: true },
    exportScheduleLastRunAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type ImportExportSettingsDocument = InferSchemaType<
  typeof ImportExportSettingsSchema
> & {
  _id: mongoose.Types.ObjectId;
};

// Next.js hot-reload can keep a stale model missing newer fields; always rebind
// the schema so import/export settings persist and load correctly.
if (mongoose.models.ImportExportSettings) {
  delete mongoose.models.ImportExportSettings;
}
const connectionModels = mongoose.connection.models as Record<
  string,
  Model<unknown> | undefined
>;
if (connectionModels.ImportExportSettings) {
  delete connectionModels.ImportExportSettings;
}

export const ImportExportSettings: Model<ImportExportSettingsDocument> =
  mongoose.model<ImportExportSettingsDocument>(
    "ImportExportSettings",
    ImportExportSettingsSchema,
  );

export const IMPORT_EXPORT_SETTINGS_KEY = "default";
