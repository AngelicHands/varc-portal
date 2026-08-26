"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveImportExportScheduleAction,
  saveImportExportSettingsAction,
  verifyImportExportSourceAction,
} from "@/lib/actions";
import {
  getDefaultImportExportDraftSecrets,
  IMPORT_EXPORT_SCHEDULE_INTERVALS,
  labelImportExportScheduleInterval,
  mergeImportExportFormValues,
  type ImportExportDirection,
  type ImportExportDirectionVerifyState,
  type ImportExportDraftSecrets,
  type ImportExportScheduleInterval,
  type ImportExportScheduleState,
  type ImportExportSettingsEditorData,
  type ImportExportSettingsPublicFormValues,
  type ImportExportSettingsVerifyState,
  type ImportExportSource,
  type ImportExportVerifyStatus,
} from "@/lib/validations/import-export";
import { notifyAction } from "@/components/admin/admin-toast";
import { AdminCheckbox } from "@/components/admin/admin-checkbox";

type Props = {
  initialData: ImportExportSettingsEditorData;
};

const BACKGROUND_VERIFY_STALE_MS = 5 * 60 * 1000;

function isVerifyStale(checkedAt: string | null): boolean {
  if (!checkedAt) return true;
  const checkedMs = new Date(checkedAt).getTime();
  if (Number.isNaN(checkedMs)) return true;
  return Date.now() - checkedMs > BACKGROUND_VERIFY_STALE_MS;
}

function needsBackgroundVerify(data: ImportExportSettingsEditorData) {
  return {
    import:
      data.savedSettings.import.isConfigured &&
      isVerifyStale(data.verifyState.import.checkedAt),
    export:
      data.savedSettings.export.isConfigured &&
      isVerifyStale(data.verifyState.export.checkedAt),
  };
}

function getSourceOptions(direction: "import" | "export") {
  const verb = direction === "import" ? "pull content from" : "publish content to";
  return [
    {
      value: "github" as const,
      label: "GitHub",
      description: `${direction === "import" ? "Import" : "Export"} jobs ${verb} a GitHub repository.`,
    },
    {
      value: "custom_url" as const,
      label: "Custom URL",
      description: `${direction === "import" ? "Import" : "Export"} jobs use a custom HTTP(S) endpoint.`,
    },
  ];
}

function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function VerifyStatusBadge({
  status,
  pending,
  checkedAt,
}: {
  status: ImportExportVerifyStatus;
  pending: boolean;
  checkedAt: string | null;
}) {
  const effectiveStatus: ImportExportVerifyStatus | "verifying" = pending
    ? "verifying"
    : status;

  const className =
    effectiveStatus === "verified"
      ? "border-green-200 bg-green-50 text-green-800"
      : effectiveStatus === "failed"
        ? "border-red-200 bg-red-50 text-red-800"
        : effectiveStatus === "verifying"
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-gray-200 bg-gray-50 text-gray-600";

  const label =
    effectiveStatus === "verified"
      ? "Verified"
      : effectiveStatus === "failed"
        ? "Failed"
        : effectiveStatus === "verifying"
          ? "Verifying…"
          : "Not verified";

  const title = formatTimestamp(checkedAt)
    ? `Last checked ${formatTimestamp(checkedAt)}`
    : undefined;

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function ConfiguredStatusBadge({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">
        Not configured
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
      Configured
    </span>
  );
}

function SecretField({
  label,
  value,
  configured,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  configured: boolean;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        name={`import-export-secret-${label.replace(/\s+/g, "-").toLowerCase()}`}
        className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
      />
      {configured ? (
        <span className="mt-1 block text-xs text-gray-500">
          A token is saved on the server. Enter a new value only to replace it.
        </span>
      ) : null}
    </label>
  );
}

function SourcePanel({
  title,
  description,
  name,
  direction,
  source,
  isConfigured,
  githubRepoUrl,
  githubBranch,
  githubPath,
  githubUsername,
  githubPat,
  githubPatConfigured,
  customUrl,
  customUsername,
  customPassword,
  customPasswordConfigured,
  verify,
  verifyPending,
  savePending,
  savedFlash,
  onSourceChange,
  onGithubRepoUrlChange,
  onGithubBranchChange,
  onGithubPathChange,
  onGithubUsernameChange,
  onGithubPatChange,
  onCustomUrlChange,
  onCustomUsernameChange,
  onCustomPasswordChange,
  onVerify,
  onSave,
  schedule,
  scheduleSavePending,
  scheduleSavedFlash,
  onScheduleEnabledChange,
  onScheduleIntervalChange,
  onSaveSchedule,
}: {
  title: string;
  description: string;
  name: string;
  direction: ImportExportDirection;
  source: ImportExportSource;
  isConfigured: boolean;
  githubRepoUrl: string;
  githubBranch: string;
  githubPath: string;
  githubUsername: string;
  githubPat: string;
  githubPatConfigured: boolean;
  customUrl: string;
  customUsername: string;
  customPassword: string;
  customPasswordConfigured: boolean;
  verify: ImportExportDirectionVerifyState;
  verifyPending: boolean;
  savePending: boolean;
  savedFlash: boolean;
  onSourceChange: (next: ImportExportSource) => void;
  onGithubRepoUrlChange: (next: string) => void;
  onGithubBranchChange: (next: string) => void;
  onGithubPathChange: (next: string) => void;
  onGithubUsernameChange: (next: string) => void;
  onGithubPatChange: (next: string) => void;
  onCustomUrlChange: (next: string) => void;
  onCustomUsernameChange: (next: string) => void;
  onCustomPasswordChange: (next: string) => void;
  onVerify: () => void;
  onSave: () => void;
  schedule: ImportExportScheduleState;
  scheduleSavePending: boolean;
  scheduleSavedFlash: boolean;
  onScheduleEnabledChange: (enabled: boolean) => void;
  onScheduleIntervalChange: (minutes: ImportExportScheduleInterval) => void;
  onSaveSchedule: () => void;
}) {
  const options = getSourceOptions(direction);
  const scheduleEnabled = Boolean(schedule.enabled);

  return (
    <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <ConfiguredStatusBadge configured={isConfigured} />
          <VerifyStatusBadge
            status={verify.status}
            pending={verifyPending}
            checkedAt={verify.checkedAt}
          />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="sr-only">{title} source</legend>
        <div className="grid gap-3">
          {options.map((option) => {
            const selected = source === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${
                  selected
                    ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={selected}
                  onChange={() => onSourceChange(option.value)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-sm text-gray-600">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {source === "github" ? (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">GitHub repository</span>
            <input
              value={githubRepoUrl}
              onChange={(e) => onGithubRepoUrlChange(e.target.value)}
              placeholder="https://github.com/org/repo or org/repo"
              className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Branch</span>
            <input
              value={githubBranch}
              onChange={(e) => onGithubBranchChange(e.target.value)}
              placeholder="main (leave empty for default branch)"
              className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Path</span>
            <input
              value={githubPath}
              onChange={(e) => onGithubPathChange(e.target.value)}
              placeholder="content, data/sync, or ./ for repo root"
              className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
            />
            <span className="mt-1 block text-xs text-gray-500">
              Folder inside the repository where content is synced.
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">GitHub username</span>
            <input
              value={githubUsername}
              onChange={(e) => onGithubUsernameChange(e.target.value)}
              placeholder="github-username"
              autoComplete="username"
              className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <SecretField
            label="Personal access token (PAT)"
            value={githubPat}
            configured={githubPatConfigured}
            placeholder={
              githubPatConfigured ? "Enter only to replace saved token" : "ghp_…"
            }
            onChange={onGithubPatChange}
          />
        </div>
      ) : null}

      {source === "custom_url" ? (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Endpoint URL</span>
            <input
              value={customUrl}
              onChange={(e) => onCustomUrlChange(e.target.value)}
              placeholder="https://example.com/content-sync"
              className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Username</span>
            <input
              value={customUsername}
              onChange={(e) => onCustomUsernameChange(e.target.value)}
              placeholder="service-account"
              autoComplete="username"
              className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <SecretField
            label="Password"
            value={customPassword}
            configured={customPasswordConfigured}
            placeholder={
              customPasswordConfigured
                ? "Enter only to replace saved password"
                : "••••••••"
            }
            onChange={onCustomPasswordChange}
          />
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Scheduled jobs</h3>
          <p className="mt-1 text-sm text-gray-600">
            The background worker runs {direction} on this interval when the
            connection is verified.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <AdminCheckbox
            suppressHydrationWarning
            checked={scheduleEnabled}
            onChange={(e) => onScheduleEnabledChange(e.target.checked)}
          />
          <span>Enable scheduled {direction}</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Interval</span>
          <select
            suppressHydrationWarning
            value={schedule.intervalMinutes}
            onChange={(e) =>
              onScheduleIntervalChange(Number(e.target.value) as ImportExportScheduleInterval)
            }
            disabled={scheduleEnabled ? undefined : true}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            {IMPORT_EXPORT_SCHEDULE_INTERVALS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {labelImportExportScheduleInterval(minutes)}
              </option>
            ))}
          </select>
        </label>
        <dl className="grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
          <div>
            <dt>Next run</dt>
            <dd suppressHydrationWarning>
              {formatTimestamp(schedule.nextRunAt) ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Last run</dt>
            <dd suppressHydrationWarning>
              {formatTimestamp(schedule.lastRunAt) ?? "—"}
            </dd>
          </div>
        </dl>
        {schedule.enabled ? (
          <p className="text-xs text-gray-600">
            Scheduled runs appear on the{" "}
            <Link
              href={
                direction === "import"
                  ? "/admin/background-jobs?tab=import"
                  : "/admin/background-jobs?tab=export"
              }
              className="font-medium text-gray-900 underline"
            >
              {direction === "import" ? "Import Jobs" : "Export Jobs"}
            </Link>{" "}
            tab. Updates stream live while this page is open.
          </p>
        ) : null}
        {scheduleSavedFlash ? (
          <p className="text-sm text-green-800">Schedule saved.</p>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={Boolean(scheduleSavePending || savePending || verifyPending)}
            onClick={onSaveSchedule}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {scheduleSavePending ? "Saving…" : "Save schedule"}
          </button>
        </div>
      </div>

      <div className="space-y-2 border-t border-gray-200 pt-4">
        {savedFlash ? (
          <p className="text-sm text-green-800">
            {direction === "import" ? "Import" : "Export"} settings saved.
          </p>
        ) : null}
        {verify.status === "failed" && verify.message ? (
          <p className="text-sm text-red-700">{verify.message}</p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={verifyPending || savePending || undefined}
            onClick={onVerify}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {verifyPending ? "Verifying…" : "Verify connection"}
          </button>
          <button
            type="button"
            disabled={savePending || verifyPending || undefined}
            onClick={onSave}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {savePending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function ImportExportSettingsEditor({ initialData }: Props) {
  const router = useRouter();
  const [importSavePending, startImportSaveTransition] = useTransition();
  const [exportSavePending, startExportSaveTransition] = useTransition();
  const [importVerifyPending, startImportVerifyTransition] = useTransition();
  const [exportVerifyPending, startExportVerifyTransition] = useTransition();
  const [importScheduleSavePending, startImportScheduleSaveTransition] =
    useTransition();
  const [exportScheduleSavePending, startExportScheduleSaveTransition] =
    useTransition();
  const [error, setError] = useState<string | null>(null);
  const [importSavedFlash, setImportSavedFlash] = useState(false);
  const [exportSavedFlash, setExportSavedFlash] = useState(false);
  const [importScheduleSavedFlash, setImportScheduleSavedFlash] = useState(false);
  const [exportScheduleSavedFlash, setExportScheduleSavedFlash] = useState(false);
  const [form, setForm] = useState<ImportExportSettingsPublicFormValues>(
    initialData.form,
  );
  const [draftSecrets, setDraftSecrets] = useState<ImportExportDraftSecrets>(
    getDefaultImportExportDraftSecrets(),
  );
  const [configuredSecrets, setConfiguredSecrets] = useState(
    initialData.configuredSecrets,
  );
  const [savedSettings, setSavedSettings] = useState(initialData.savedSettings);
  const [verifyState, setVerifyState] = useState<ImportExportSettingsVerifyState>(
    initialData.verifyState,
  );
  const [schedule, setSchedule] = useState(initialData.schedule);
  const [backgroundVerifyPending, setBackgroundVerifyPending] = useState(() =>
    needsBackgroundVerify(initialData),
  );

  useEffect(() => {
    let cancelled = false;
    const pending = needsBackgroundVerify(initialData);

    if (!pending.import && !pending.export) {
      return;
    }

    void fetch("/api/admin/import-export/verify", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          verifyState?: ImportExportSettingsVerifyState;
        };
      })
      .then((payload) => {
        if (cancelled || !payload?.verifyState) return;
        setVerifyState(payload.verifyState);
      })
      .catch(() => {
        // Keep cached verify badges on background failures.
      })
      .finally(() => {
        if (!cancelled) {
          setBackgroundVerifyPending({ import: false, export: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialData]);

  function applyEditorData(data: ImportExportSettingsEditorData) {
    setForm(data.form);
    setConfiguredSecrets(data.configuredSecrets);
    setSavedSettings(data.savedSettings);
    setVerifyState(data.verifyState);
    setSchedule(data.schedule);
    setDraftSecrets(getDefaultImportExportDraftSecrets());
  }

  function resetDirectionVerify(direction: ImportExportDirection) {
    setVerifyState((prev) => ({
      ...prev,
      [direction]: {
        status: "unknown",
        message: "",
        checkedAt: null,
      },
    }));
  }

  function markDirty(direction: ImportExportDirection) {
    if (direction === "import") {
      setImportSavedFlash(false);
    } else {
      setExportSavedFlash(false);
    }
    resetDirectionVerify(direction);
  }

  function buildRequestForm() {
    return mergeImportExportFormValues(form, draftSecrets);
  }

  function saveDirectionSettings(direction: ImportExportDirection) {
    setError(null);
    if (direction === "import") {
      setImportSavedFlash(false);
    } else {
      setExportSavedFlash(false);
    }

    const startTransition =
      direction === "import"
        ? startImportSaveTransition
        : startExportSaveTransition;

    startTransition(async () => {
      const result = await saveImportExportSettingsAction({
        direction,
        form: buildRequestForm(),
      });
      const label = direction === "import" ? "Import" : "Export";
      if (!notifyAction(result, `${label} settings saved`)) {
        setError(result.error);
        return;
      }
      applyEditorData(result.data);
      if (direction === "import") {
        setImportSavedFlash(true);
      } else {
        setExportSavedFlash(true);
      }
      router.refresh();
    });
  }

  function onVerify(direction: ImportExportDirection) {
    setError(null);
    const startTransition =
      direction === "import"
        ? startImportVerifyTransition
        : startExportVerifyTransition;

    startTransition(async () => {
      const result = await verifyImportExportSourceAction({
        direction,
        form: buildRequestForm(),
      });
      setVerifyState((prev) => ({
        ...prev,
        [direction]: result.verify,
      }));
      if (result.ok) {
        notifyAction(
          result,
          `${direction === "import" ? "Import" : "Export"} connection verified`,
        );
        return;
      }
      setError(result.error);
    });
  }

  function saveDirectionSchedule(direction: ImportExportDirection) {
    setError(null);
    if (direction === "import") {
      setImportScheduleSavedFlash(false);
    } else {
      setExportScheduleSavedFlash(false);
    }

    const startTransition =
      direction === "import"
        ? startImportScheduleSaveTransition
        : startExportScheduleSaveTransition;
    const current = schedule[direction];

    startTransition(async () => {
      const result = await saveImportExportScheduleAction({
        direction,
        enabled: current.enabled,
        intervalMinutes: current.intervalMinutes,
      });
      const label = direction === "import" ? "Import" : "Export";
      if (!notifyAction(result, `${label} schedule saved`)) {
        setError(result.error);
        return;
      }
      applyEditorData(result.data);
      if (direction === "import") {
        setImportScheduleSavedFlash(true);
      } else {
        setExportScheduleSavedFlash(true);
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-6">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <SourcePanel
          title="Import"
          description="Configure where import jobs pull content from."
          name="import-source"
          direction="import"
          isConfigured={savedSettings.import.isConfigured}
          source={form.importSource}
          githubRepoUrl={form.importGithubRepoUrl}
          githubBranch={form.importGithubBranch}
          githubPath={form.importGithubPath}
          githubUsername={form.importGithubUsername}
          githubPat={draftSecrets.importGithubPat}
          githubPatConfigured={configuredSecrets.importGithubPat}
          customUrl={form.importCustomUrl}
          customUsername={form.importCustomUsername}
          customPassword={draftSecrets.importCustomPassword}
          customPasswordConfigured={configuredSecrets.importCustomPassword}
          verify={verifyState.import}
          verifyPending={importVerifyPending || backgroundVerifyPending.import}
          savePending={importSavePending}
          savedFlash={importSavedFlash}
          onSourceChange={(importSource) => {
            setForm((prev) => ({ ...prev, importSource }));
            markDirty("import");
          }}
          onGithubRepoUrlChange={(importGithubRepoUrl) => {
            setForm((prev) => ({ ...prev, importGithubRepoUrl }));
            markDirty("import");
          }}
          onGithubBranchChange={(importGithubBranch) => {
            setForm((prev) => ({ ...prev, importGithubBranch }));
            markDirty("import");
          }}
          onGithubPathChange={(importGithubPath) => {
            setForm((prev) => ({ ...prev, importGithubPath }));
            markDirty("import");
          }}
          onGithubUsernameChange={(importGithubUsername) => {
            setForm((prev) => ({ ...prev, importGithubUsername }));
            markDirty("import");
          }}
          onGithubPatChange={(importGithubPat) => {
            setDraftSecrets((prev) => ({ ...prev, importGithubPat }));
            markDirty("import");
          }}
          onCustomUrlChange={(importCustomUrl) => {
            setForm((prev) => ({ ...prev, importCustomUrl }));
            markDirty("import");
          }}
          onCustomUsernameChange={(importCustomUsername) => {
            setForm((prev) => ({ ...prev, importCustomUsername }));
            markDirty("import");
          }}
          onCustomPasswordChange={(importCustomPassword) => {
            setDraftSecrets((prev) => ({ ...prev, importCustomPassword }));
            markDirty("import");
          }}
          onVerify={() => onVerify("import")}
          onSave={() => saveDirectionSettings("import")}
          schedule={schedule.import}
          scheduleSavePending={importScheduleSavePending}
          scheduleSavedFlash={importScheduleSavedFlash}
          onScheduleEnabledChange={(enabled) => {
            setSchedule((prev) => ({
              ...prev,
              import: { ...prev.import, enabled },
            }));
            setImportScheduleSavedFlash(false);
          }}
          onScheduleIntervalChange={(intervalMinutes) => {
            setSchedule((prev) => ({
              ...prev,
              import: { ...prev.import, intervalMinutes },
            }));
            setImportScheduleSavedFlash(false);
          }}
          onSaveSchedule={() => saveDirectionSchedule("import")}
        />

        <SourcePanel
          title="Export"
          description="Configure where export jobs publish content to."
          name="export-source"
          direction="export"
          isConfigured={savedSettings.export.isConfigured}
          source={form.exportSource}
          githubRepoUrl={form.exportGithubRepoUrl}
          githubBranch={form.exportGithubBranch}
          githubPath={form.exportGithubPath}
          githubUsername={form.exportGithubUsername}
          githubPat={draftSecrets.exportGithubPat}
          githubPatConfigured={configuredSecrets.exportGithubPat}
          customUrl={form.exportCustomUrl}
          customUsername={form.exportCustomUsername}
          customPassword={draftSecrets.exportCustomPassword}
          customPasswordConfigured={configuredSecrets.exportCustomPassword}
          verify={verifyState.export}
          verifyPending={exportVerifyPending || backgroundVerifyPending.export}
          savePending={exportSavePending}
          savedFlash={exportSavedFlash}
          onSourceChange={(exportSource) => {
            setForm((prev) => ({ ...prev, exportSource }));
            markDirty("export");
          }}
          onGithubRepoUrlChange={(exportGithubRepoUrl) => {
            setForm((prev) => ({ ...prev, exportGithubRepoUrl }));
            markDirty("export");
          }}
          onGithubBranchChange={(exportGithubBranch) => {
            setForm((prev) => ({ ...prev, exportGithubBranch }));
            markDirty("export");
          }}
          onGithubPathChange={(exportGithubPath) => {
            setForm((prev) => ({ ...prev, exportGithubPath }));
            markDirty("export");
          }}
          onGithubUsernameChange={(exportGithubUsername) => {
            setForm((prev) => ({ ...prev, exportGithubUsername }));
            markDirty("export");
          }}
          onGithubPatChange={(exportGithubPat) => {
            setDraftSecrets((prev) => ({ ...prev, exportGithubPat }));
            markDirty("export");
          }}
          onCustomUrlChange={(exportCustomUrl) => {
            setForm((prev) => ({ ...prev, exportCustomUrl }));
            markDirty("export");
          }}
          onCustomUsernameChange={(exportCustomUsername) => {
            setForm((prev) => ({ ...prev, exportCustomUsername }));
            markDirty("export");
          }}
          onCustomPasswordChange={(exportCustomPassword) => {
            setDraftSecrets((prev) => ({ ...prev, exportCustomPassword }));
            markDirty("export");
          }}
          onVerify={() => onVerify("export")}
          onSave={() => saveDirectionSettings("export")}
          schedule={schedule.export}
          scheduleSavePending={exportScheduleSavePending}
          scheduleSavedFlash={exportScheduleSavedFlash}
          onScheduleEnabledChange={(enabled) => {
            setSchedule((prev) => ({
              ...prev,
              export: { ...prev.export, enabled },
            }));
            setExportScheduleSavedFlash(false);
          }}
          onScheduleIntervalChange={(intervalMinutes) => {
            setSchedule((prev) => ({
              ...prev,
              export: { ...prev.export, intervalMinutes },
            }));
            setExportScheduleSavedFlash(false);
          }}
          onSaveSchedule={() => saveDirectionSchedule("export")}
        />
      </div>
    </div>
  );
}
