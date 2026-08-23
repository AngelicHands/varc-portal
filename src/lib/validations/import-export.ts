import { z } from "zod";
import { isSafePublicUrl } from "@/lib/safe-url";

export const importExportSourceSchema = z.enum(["github", "custom_url"]);

export type ImportExportSource = z.infer<typeof importExportSourceSchema>;

const credentialUsernameSchema = z.string().trim().max(200);
const credentialSecretSchema = z.string().max(512);

const githubRepoUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine(
    (value) =>
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(value) ||
      /^[\w.-]+\/[\w.-]+$/.test(value),
    {
      message: "Enter a GitHub repository URL or owner/repo slug",
    },
  );

const customSourceUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine(isSafePublicUrl, {
    message: "URL must be http(s) or a site-relative path",
  });

const githubPathSchema = z
  .string()
  .trim()
  .max(512)
  .refine(
    (value) => {
      if (!value) return true;
      if (value.includes("..") || value.includes("\\")) {
        return false;
      }
      const normalized = normalizeGithubPath(value);
      if (!normalized) return true;
      if (normalized.startsWith("/")) return false;
      return /^[\w./-]+$/.test(normalized);
    },
    {
      message: "Enter a folder path inside the repo (e.g. ./ or content/data)",
    },
  );

const githubBranchSchema = z
  .string()
  .trim()
  .max(255)
  .refine(
    (value) => !value || /^[\w./-]+$/.test(value),
    { message: "Enter a valid branch name" },
  );

export function normalizeGithubPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed === "." || trimmed === "./") {
    return "./";
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "");
  if (withoutLeadingSlash === "." || withoutLeadingSlash === "./") {
    return "./";
  }

  return withoutLeadingSlash.replace(/\/+$/, "");
}

/** @deprecated Use normalizeGithubPath */
export const normalizeGithubSyncPath = normalizeGithubPath;

export function normalizeGithubBranch(value: string): string {
  return value.trim();
}

export function isGithubRepoRootPath(value: string): boolean {
  const normalized = normalizeGithubPath(value);
  return !normalized || normalized === "./";
}

/** @deprecated Use isGithubRepoRootPath */
export const isGithubRepoRootSyncPath = isGithubRepoRootPath;

type DirectionCredentials = {
  source: ImportExportSource;
  githubRepoUrl: string;
  githubBranch: string;
  githubUsername: string;
  githubPat: string;
  githubPath: string;
  customUrl: string;
  customUsername: string;
  customPassword: string;
};

function validateDirectionSource(
  data: DirectionCredentials,
  ctx: z.RefinementCtx,
  prefix: "import" | "export",
) {
  if (data.source === "github") {
    if (!data.githubRepoUrl) {
      ctx.addIssue({
        code: "custom",
        message: "GitHub repository is required",
        path: [`${prefix}GithubRepoUrl`],
      });
    } else {
      const parsed = githubRepoUrlSchema.safeParse(data.githubRepoUrl);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message:
            parsed.error.issues[0]?.message ?? "Invalid GitHub repository",
          path: [`${prefix}GithubRepoUrl`],
        });
      }
    }

    if (!data.githubUsername) {
      ctx.addIssue({
        code: "custom",
        message: "GitHub username is required",
        path: [`${prefix}GithubUsername`],
      });
    }

    if (data.githubPath) {
      const parsed = githubPathSchema.safeParse(data.githubPath);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: parsed.error.issues[0]?.message ?? "Invalid GitHub path",
          path: [`${prefix}GithubPath`],
        });
      }
    }

    if (data.githubBranch) {
      const parsed = githubBranchSchema.safeParse(data.githubBranch);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: parsed.error.issues[0]?.message ?? "Invalid GitHub branch",
          path: [`${prefix}GithubBranch`],
        });
      }
    }

    return;
  }

  if (!data.customUrl) {
    ctx.addIssue({
      code: "custom",
      message: "Custom URL is required",
      path: [`${prefix}CustomUrl`],
    });
  } else {
    const parsed = customSourceUrlSchema.safeParse(data.customUrl);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: parsed.error.issues[0]?.message ?? "Invalid custom URL",
        path: [`${prefix}CustomUrl`],
      });
    }
  }

  if (!data.customUsername) {
    ctx.addIssue({
      code: "custom",
      message: "Username is required",
      path: [`${prefix}CustomUsername`],
    });
  }
}

export const importExportSettingsFieldsSchema = z.object({
  importSource: importExportSourceSchema,
  exportSource: importExportSourceSchema,
  importGithubRepoUrl: z.string().trim().max(2_048),
  importGithubBranch: z.string().trim().max(255),
  importGithubPath: z.string().trim().max(512),
  importGithubUsername: credentialUsernameSchema,
  importGithubPat: credentialSecretSchema,
  importCustomUrl: z.string().trim().max(2_048),
  importCustomUsername: credentialUsernameSchema,
  importCustomPassword: credentialSecretSchema,
  exportGithubRepoUrl: z.string().trim().max(2_048),
  exportGithubBranch: z.string().trim().max(255),
  exportGithubPath: z.string().trim().max(512),
  exportGithubUsername: credentialUsernameSchema,
  exportGithubPat: credentialSecretSchema,
  exportCustomUrl: z.string().trim().max(2_048),
  exportCustomUsername: credentialUsernameSchema,
  exportCustomPassword: credentialSecretSchema,
});

export const importExportSettingsFormSchema = importExportSettingsFieldsSchema.superRefine(
  (data, ctx) => {
    validateDirectionSource(
      {
        source: data.importSource,
        githubRepoUrl: data.importGithubRepoUrl,
        githubBranch: data.importGithubBranch,
        githubUsername: data.importGithubUsername,
        githubPat: data.importGithubPat,
        githubPath: data.importGithubPath,
        customUrl: data.importCustomUrl,
        customUsername: data.importCustomUsername,
        customPassword: data.importCustomPassword,
      },
      ctx,
      "import",
    );
    validateDirectionSource(
      {
        source: data.exportSource,
        githubRepoUrl: data.exportGithubRepoUrl,
        githubBranch: data.exportGithubBranch,
        githubUsername: data.exportGithubUsername,
        githubPat: data.exportGithubPat,
        githubPath: data.exportGithubPath,
        customUrl: data.exportCustomUrl,
        customUsername: data.exportCustomUsername,
        customPassword: data.exportCustomPassword,
      },
      ctx,
      "export",
    );
  },
);

export type ImportExportSettingsFormValues = z.infer<
  typeof importExportSettingsFormSchema
>;

export type ImportExportDraftSecrets = {
  importGithubPat: string;
  importCustomPassword: string;
  exportGithubPat: string;
  exportCustomPassword: string;
};

export type ImportExportSettingsPublicFormValues = Omit<
  ImportExportSettingsFormValues,
  keyof ImportExportDraftSecrets
>;

export type ImportExportDirectionSavedSettings = {
  isConfigured: boolean;
  updatedAt: string | null;
  source: ImportExportSource;
  githubRepoUrl: string;
  githubBranch: string;
  githubPath: string;
  githubUsername: string;
  customUrl: string;
  customUsername: string;
  githubPatConfigured: boolean;
  customPasswordConfigured: boolean;
};

export type ImportExportSettingsSavedState = {
  import: ImportExportDirectionSavedSettings;
  export: ImportExportDirectionSavedSettings;
};

export function getDefaultImportExportDraftSecrets(): ImportExportDraftSecrets {
  return {
    importGithubPat: "",
    importCustomPassword: "",
    exportGithubPat: "",
    exportCustomPassword: "",
  };
}

export function mergeImportExportFormValues(
  form: ImportExportSettingsPublicFormValues,
  secrets: ImportExportDraftSecrets,
): z.infer<typeof importExportSettingsFieldsSchema> {
  return {
    ...form,
    ...secrets,
  };
}

export function stripImportExportSecrets(
  form: z.infer<typeof importExportSettingsFieldsSchema>,
): ImportExportSettingsPublicFormValues {
  return {
    importSource: form.importSource,
    exportSource: form.exportSource,
    importGithubRepoUrl: form.importGithubRepoUrl,
    importGithubBranch: form.importGithubBranch,
    importGithubPath: form.importGithubPath,
    importGithubUsername: form.importGithubUsername,
    importCustomUrl: form.importCustomUrl,
    importCustomUsername: form.importCustomUsername,
    exportGithubRepoUrl: form.exportGithubRepoUrl,
    exportGithubBranch: form.exportGithubBranch,
    exportGithubPath: form.exportGithubPath,
    exportGithubUsername: form.exportGithubUsername,
    exportCustomUrl: form.exportCustomUrl,
    exportCustomUsername: form.exportCustomUsername,
  };
}

export type ImportExportVerifyStatus = "unknown" | "verified" | "failed";

export type ImportExportDirectionVerifyState = {
  status: ImportExportVerifyStatus;
  message: string;
  checkedAt: string | null;
};

export type ImportExportSettingsVerifyState = {
  import: ImportExportDirectionVerifyState;
  export: ImportExportDirectionVerifyState;
};

export const importExportDirectionSchema = z.enum(["import", "export"]);

export type ImportExportDirection = z.infer<typeof importExportDirectionSchema>;

export const IMPORT_EXPORT_SCHEDULE_INTERVALS = [1, 5, 15, 30, 60, 360, 1440] as const;
export type ImportExportScheduleInterval =
  (typeof IMPORT_EXPORT_SCHEDULE_INTERVALS)[number];

export type ImportExportScheduleState = {
  enabled: boolean;
  intervalMinutes: ImportExportScheduleInterval;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export const importExportScheduleIntervalSchema = z.coerce
  .number()
  .int()
  .refine(
    (value): value is ImportExportScheduleInterval =>
      (IMPORT_EXPORT_SCHEDULE_INTERVALS as readonly number[]).includes(value),
    { message: "Choose a valid schedule interval" },
  );

export const importExportScheduleFormSchema = z.object({
  direction: importExportDirectionSchema,
  enabled: z.boolean(),
  intervalMinutes: importExportScheduleIntervalSchema,
});

export type ImportExportScheduleFormValues = z.infer<
  typeof importExportScheduleFormSchema
>;

export const importExportVerifyRequestSchema = z
  .object({
    direction: importExportDirectionSchema,
    form: importExportSettingsFieldsSchema,
  })
  .superRefine((data, ctx) => {
    const prefix = data.direction;
    validateDirectionSource(
      {
        source:
          prefix === "import" ? data.form.importSource : data.form.exportSource,
        githubRepoUrl:
          prefix === "import"
            ? data.form.importGithubRepoUrl
            : data.form.exportGithubRepoUrl,
        githubUsername:
          prefix === "import"
            ? data.form.importGithubUsername
            : data.form.exportGithubUsername,
        githubPat:
          prefix === "import"
            ? data.form.importGithubPat
            : data.form.exportGithubPat,
        githubBranch:
          prefix === "import"
            ? data.form.importGithubBranch
            : data.form.exportGithubBranch,
        githubPath:
          prefix === "import"
            ? data.form.importGithubPath
            : data.form.exportGithubPath,
        customUrl:
          prefix === "import"
            ? data.form.importCustomUrl
            : data.form.exportCustomUrl,
        customUsername:
          prefix === "import"
            ? data.form.importCustomUsername
            : data.form.exportCustomUsername,
        customPassword:
          prefix === "import"
            ? data.form.importCustomPassword
            : data.form.exportCustomPassword,
      },
      ctx,
      prefix,
    );
  });

export const importExportSaveRequestSchema = importExportVerifyRequestSchema;

export type ImportExportSettingsConfiguredSecrets = {
  importGithubPat: boolean;
  importCustomPassword: boolean;
  exportGithubPat: boolean;
  exportCustomPassword: boolean;
};

export type ImportExportSettingsEditorData = {
  form: ImportExportSettingsPublicFormValues;
  configuredSecrets: ImportExportSettingsConfiguredSecrets;
  verifyState: ImportExportSettingsVerifyState;
  savedSettings: ImportExportSettingsSavedState;
  schedule: {
    import: ImportExportScheduleState;
    export: ImportExportScheduleState;
  };
};

export function getDefaultImportExportSettingsPublicForm(): ImportExportSettingsPublicFormValues {
  return {
    importSource: "github",
    exportSource: "github",
    importGithubRepoUrl: "",
    importGithubBranch: "",
    importGithubPath: "",
    importGithubUsername: "",
    importCustomUrl: "",
    importCustomUsername: "",
    exportGithubRepoUrl: "",
    exportGithubBranch: "",
    exportGithubPath: "",
    exportGithubUsername: "",
    exportCustomUrl: "",
    exportCustomUsername: "",
  };
}

export function labelImportExportScheduleInterval(
  minutes: ImportExportScheduleInterval,
): string {
  switch (minutes) {
    case 1:
      return "Every 1 minute";
    case 5:
      return "Every 5 minutes";
    case 15:
      return "Every 15 minutes";
    case 30:
      return "Every 30 minutes";
    case 60:
      return "Hourly";
    case 360:
      return "Every 6 hours";
    case 1440:
      return "Daily";
    default:
      return `Every ${minutes} minutes`;
  }
}

export function getDefaultImportExportSettingsForm(): ImportExportSettingsFormValues {
  return {
    ...getDefaultImportExportSettingsPublicForm(),
    ...getDefaultImportExportDraftSecrets(),
  };
}

export function getDefaultSavedSettings(): ImportExportSettingsSavedState {
  const empty: ImportExportDirectionSavedSettings = {
    isConfigured: false,
    updatedAt: null,
    source: "github",
    githubRepoUrl: "",
    githubBranch: "",
    githubPath: "",
    githubUsername: "",
    customUrl: "",
    customUsername: "",
    githubPatConfigured: false,
    customPasswordConfigured: false,
  };
  return {
    import: { ...empty },
    export: { ...empty },
  };
}

export function getDefaultVerifyState(): ImportExportSettingsVerifyState {
  const unknown: ImportExportDirectionVerifyState = {
    status: "unknown",
    message: "",
    checkedAt: null,
  };
  return { import: { ...unknown }, export: { ...unknown } };
}

export function getDefaultConfiguredSecrets(): ImportExportSettingsConfiguredSecrets {
  return {
    importGithubPat: false,
    importCustomPassword: false,
    exportGithubPat: false,
    exportCustomPassword: false,
  };
}
