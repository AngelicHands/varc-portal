import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  createHlsPosterJob,
  hasActiveHlsPosterJob,
  listHlsPosterJobs,
  stopAllHlsPosterJobs,
} from "@/lib/hls-poster/jobs";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await listHlsPosterJobs();
  return NextResponse.json({ jobs, hasActive: await hasActiveHlsPosterJob() });
}

export async function POST(request: Request) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      batchLimit?: number;
    };

    if (payload.action === "stop") {
      const stopped = await stopAllHlsPosterJobs();
      const jobs = await listHlsPosterJobs();
      return NextResponse.json({ ok: true, stopped, jobs });
    }

    if (payload.action && payload.action !== "start") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (await hasActiveHlsPosterJob()) {
      return NextResponse.json(
        { error: "Another HLS poster job is already queued or running" },
        { status: 409 },
      );
    }

    const job = await createHlsPosterJob({
      requestedByUserId: session.user.id,
      requestedByEmail: session.user.email,
      requestedByName: session.user.name,
      batchLimit:
        typeof payload.batchLimit === "number" ? payload.batchLimit : 0,
    });
    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to manage HLS poster jobs") },
      { status: 500 },
    );
  }
}
