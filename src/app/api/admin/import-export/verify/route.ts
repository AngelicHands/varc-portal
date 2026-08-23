import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import { refreshImportExportVerifyState } from "@/lib/import-export-settings";
import { canManageImportExport } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSiteAdminApi();
  if (!session || !canManageImportExport(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const verifyState = await refreshImportExportVerifyState();
    return NextResponse.json({ verifyState });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Verification failed") },
      { status: 500 },
    );
  }
}
