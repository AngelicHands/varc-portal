import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  cancelHlsPosterJob,
  deleteHlsPosterJob,
  getHlsPosterJob,
  hasActiveHlsPosterJob,
  retryHlsPosterJob,
} from "@/lib/hls-poster/jobs";

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
  const job = await getHlsPosterJob(id);
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

  if (payload.action === "cancel") {
    const job = await cancelHlsPosterJob(id);
    if (!job) {
      return NextResponse.json(
        { error: "Only queued or running jobs can be cancelled" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, job });
  }

  if (payload.action === "retry") {
    if (await hasActiveHlsPosterJob()) {
      return NextResponse.json(
        { error: "Another HLS poster job is already queued or running" },
        { status: 409 },
      );
    }
    const job = await retryHlsPosterJob(id);
    if (!job) {
      return NextResponse.json(
        { error: "Only failed or cancelled jobs can be retried" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, job });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
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
  const deleted = await deleteHlsPosterJob(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Only non-running jobs can be deleted" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
