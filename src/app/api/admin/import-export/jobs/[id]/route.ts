import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  deleteImportExportJob,
  getImportExportJobDocument,
} from "@/lib/import-export/jobs";
import { canManageImportExport } from "@/lib/roles";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSiteAdminApi();
  if (!session || !canManageImportExport(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getImportExportJobDocument(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = await deleteImportExportJob(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Running jobs cannot be deleted" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
