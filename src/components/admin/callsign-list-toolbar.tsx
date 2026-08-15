"use client";

import { useState } from "react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { CallsignEditor } from "@/components/admin/callsign-editor";
import { CallsignImportForm } from "@/components/admin/callsign-import-form";

type LastImport = {
  sourceFile: string;
  importedAt: string | null;
  rowCount: number;
} | null;

export function CallsignListToolbar({ lastImport }: { lastImport: LastImport }) {
  const [modal, setModal] = useState<"import" | "add" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setModal("import")}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Import
        </button>
        <button
          type="button"
          onClick={() => setModal("add")}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          Add
        </button>
      </div>

      <AdminDialog
        open={modal === "import"}
        title="Import Excel"
        onClose={() => setModal(null)}
      >
        <CallsignImportForm
          lastImport={lastImport}
          onClose={() => setModal(null)}
        />
      </AdminDialog>

      <AdminDialog
        open={modal === "add"}
        title="Add callsign"
        size="lg"
        onClose={() => setModal(null)}
      >
        {modal === "add" ? (
          <CallsignEditor
            embedded
            onSaved={() => setModal(null)}
            onCancel={() => setModal(null)}
          />
        ) : null}
      </AdminDialog>
    </>
  );
}
