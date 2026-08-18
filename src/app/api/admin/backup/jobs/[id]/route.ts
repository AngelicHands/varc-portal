import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import { cancelBackupJob, deleteBackupJob, getBackupJob } from "@/lib/backup/jobs";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => ({}))) as {
    action?: string;
  };

  if (payload.action !== "cancel") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const job = await cancelBackupJob(id);
  if (!job) {
    return NextResponse.json(
      { error: "Only queued or running jobs can be cancelled" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, job });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await deleteBackupJob(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Only non-running jobs can be deleted" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
