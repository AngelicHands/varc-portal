import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import { getBackupJob } from "@/lib/backup/jobs";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await getBackupJob(id);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
