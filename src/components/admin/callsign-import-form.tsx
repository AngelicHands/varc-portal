"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importCallsignsExcelAction } from "@/lib/callsign-actions";
import { notifyAction } from "@/components/admin/admin-toast";

type Props = {
  lastImport: {
    sourceFile: string;
    importedAt: string | null;
    rowCount: number;
  } | null;
  onClose: () => void;
};

export function CallsignImportForm({ lastImport, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setError(null);
        startTransition(async () => {
          const result = await importCallsignsExcelAction(data);
          if (!result.ok) {
            notifyAction(result, "");
            setError(result.error);
            return;
          }
          notifyAction(
            result,
            `Imported ${result.callsigns} callsigns (${result.events} license events)`,
          );
          form.reset();
          router.refresh();
          onClose();
        });
      }}
    >
      <p className="text-sm text-gray-600">
        Upload the VARC Excel workbook (.xlsx) with columns STT, Họ tên, Hô
        hiệu, Giấy phép, Ngày cấp, Ngày hết hạn, Ghi chú.
      </p>
      {lastImport ? (
        <p className="mt-2 text-xs text-gray-500">
          Last import: {lastImport.sourceFile} · {lastImport.rowCount} rows
          {lastImport.importedAt
            ? ` · ${new Date(lastImport.importedAt).toLocaleString("vi-VN")}`
            : ""}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Excel file</span>
        <input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="w-full text-sm"
        />
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" name="replace" className="mt-0.5" />
        <span>
          Replace existing directory (deletes current callsigns, then imports
          the file)
        </span>
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
    </form>
  );
}
