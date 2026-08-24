"use client";

import { useState } from "react";
import { notifyAction } from "@/components/admin/admin-toast";
import {
  CALLSIGN_OPERATOR_KIND_FILTERS,
  CALLSIGN_PERMIT_TYPE_FILTERS,
  type OperatorKindFilter,
  type PermitTypeFilter,
} from "@/lib/callsigns-filters";

type Props = {
  onClose: () => void;
};

type Format = "xlsx" | "csv" | "json";
type Scope = "latest" | "events";

export function CallsignExportForm({ onClose }: Props) {
  const [operatorKind, setOperatorKind] = useState<OperatorKindFilter>("all");
  const [permitType, setPermitType] = useState<PermitTypeFilter>("all");
  const [scope, setScope] = useState<Scope>("latest");
  const [format, setFormat] = useState<Format>("xlsx");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDownload() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/admin/callsigns/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorKind,
          permitType,
          format,
          scope,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error || "Failed to export callsigns");
        notifyAction(
          { ok: false, error: payload.error || "Failed to export callsigns" },
          "",
        );
        return;
      }

      const blob = await response.blob();
      const header = response.headers.get("Content-Disposition") || "";
      const match = header.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `varc-callsigns.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notifyAction({ ok: true }, "Callsigns downloaded");
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Filter by operator type and license kind, then download Excel, CSV, or
        JSON.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Operator type</span>
          <select
            value={operatorKind}
            onChange={(event) =>
              setOperatorKind(event.target.value as OperatorKindFilter)
            }
            className="w-full rounded border border-gray-300 bg-white px-3 py-2"
          >
            {CALLSIGN_OPERATOR_KIND_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Kind</span>
          <select
            value={permitType}
            onChange={(event) =>
              setPermitType(event.target.value as PermitTypeFilter)
            }
            className="w-full rounded border border-gray-300 bg-white px-3 py-2"
          >
            {CALLSIGN_PERMIT_TYPE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Rows</span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2"
          >
            <option value="latest">Latest license only</option>
            <option value="events">All license events</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Format</span>
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as Format)}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2"
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void onDownload()}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Preparing…" : "Download"}
        </button>
      </div>
    </div>
  );
}
