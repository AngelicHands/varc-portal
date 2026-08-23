"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { runCmsImportAction } from "@/lib/actions";
import { notifyAction } from "@/components/admin/admin-toast";
import type { ImportSettingsSummary } from "@/lib/import-export/import/load-import-config";

type Props = {
  settings: ImportSettingsSummary;
};

type ImportResult = {
  stats: {
    categories: number;
    articles: number;
    mediaFiles: number;
    skippedPairs: number;
  };
};

export function ImportJobsPanel({ settings }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const canRun =
    settings.source === "github" &&
    settings.isConfigured &&
    settings.isVerified;

  function onRunImport() {
    setError(null);
    startTransition(async () => {
      const result = await runCmsImportAction();
      if (!result.ok) {
        setError(result.error);
        notifyAction(result, "");
        return;
      }
      setLastResult({ stats: result.stats });
      notifyAction(result, "Import completed from GitHub");
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">
          Import from GitHub
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Import categories, articles, and media from Markdown files in the
          configured GitHub repository into MongoDB. The{" "}
          <code className="rounded bg-gray-100 px-1">example/</code> folder is
          never imported.
        </p>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Repository</dt>
            <dd className="font-mono text-gray-900">
              {settings.repoUrl || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Branch</dt>
            <dd className="font-mono text-gray-900">
              {settings.branch || "main"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Path prefix</dt>
            <dd className="font-mono text-gray-900">
              {settings.syncRoot ? settings.syncRoot : "./ (repo root)"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="text-gray-900">
              {!settings.isConfigured
                ? "Not configured"
                : settings.isVerified
                  ? "Verified"
                  : "Not verified"}
            </dd>
          </div>
        </dl>

        {!settings.isConfigured ? (
          <p className="mt-4 text-sm text-amber-800">
            Configure import settings on the{" "}
            <Link href="/admin/import-export" className="underline">
              Settings
            </Link>{" "}
            tab first.
          </p>
        ) : null}

        {settings.isConfigured && !settings.isVerified ? (
          <p className="mt-4 text-sm text-amber-800">
            Verify the import connection on the Settings tab before running
            import.
          </p>
        ) : null}

        {settings.source !== "github" ? (
          <p className="mt-4 text-sm text-amber-800">
            Custom URL import is not supported yet. Switch import source to
            GitHub in Settings.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canRun || pending || undefined}
            onClick={onRunImport}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Importing…" : "Run import"}
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {lastResult ? (
        <section className="rounded-lg border border-green-200 bg-green-50 p-5">
          <h3 className="text-sm font-semibold text-green-900">Last import</h3>
          <ul className="mt-2 space-y-1 text-sm text-green-900">
            <li>{lastResult.stats.categories} categories</li>
            <li>{lastResult.stats.articles} articles</li>
            <li>{lastResult.stats.mediaFiles} media files processed</li>
            {lastResult.stats.skippedPairs > 0 ? (
              <li>{lastResult.stats.skippedPairs} incomplete locale pairs skipped</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
