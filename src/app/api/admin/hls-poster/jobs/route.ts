import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  parseAdminJobsPage,
  parseAdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";
import {
  createHlsPosterJob,
  hasActiveHlsPosterJob,
  listHlsPosterJobsPage,
  stopAllHlsPosterJobs,
} from "@/lib/hls-poster/jobs";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = parseAdminJobsPage(url.searchParams.get("page"));
  const pageSize = parseAdminJobsPageSize(url.searchParams.get("pageSize"));
  const [jobsPage, hasActive] = await Promise.all([
    listHlsPosterJobsPage(page, pageSize),
    hasActiveHlsPosterJob(),
  ]);
  return NextResponse.json({ ...jobsPage, hasActive });
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
      page?: number;
      pageSize?: number;
    };

    if (payload.action === "stop") {
      const stopped = await stopAllHlsPosterJobs();
      const page = parseAdminJobsPage(String(payload.page ?? 1));
      const pageSize = parseAdminJobsPageSize(String(payload.pageSize ?? ""));
      const jobsPage = await listHlsPosterJobsPage(page, pageSize);
      return NextResponse.json({
        ok: true,
        stopped,
        ...jobsPage,
        hasActive: await hasActiveHlsPosterJob(),
      });
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
