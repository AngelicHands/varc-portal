import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import { canManageImportExport } from "@/lib/roles";
import {
  createImportExportJob,
  deleteImportExportJobs,
  hasActiveImportExportJob,
  listImportExportJobsPage,
  parseImportExportJobsPage,
  parseImportExportJobsPageSize,
} from "@/lib/import-export/jobs";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireSiteAdminApi();
  if (!session || !canManageImportExport(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  if (kindParam !== "import" && kindParam !== "export") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const page = parseImportExportJobsPage(url.searchParams.get("page"));
  const pageSize = parseImportExportJobsPageSize(
    url.searchParams.get("pageSize"),
  );
  const result = await listImportExportJobsPage(kindParam, page, pageSize);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await requireSiteAdminApi();
  if (!session || !canManageImportExport(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { kind?: string };
    const kind = body.kind?.trim();
    if (kind !== "import" && kind !== "export") {
      return NextResponse.json({ error: "Invalid job type" }, { status: 400 });
    }

    if (await hasActiveImportExportJob(kind)) {
      return NextResponse.json(
        { error: `Another ${kind} job is already active` },
        { status: 409 },
      );
    }

    const job = await createImportExportJob({
      kind,
      trigger: "manual",
      requestedByUserId: session.user.id,
      requestedByEmail: session.user.email,
      requestedByName: session.user.name,
    });
    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to create job") },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await requireSiteAdminApi();
  if (!session || !canManageImportExport(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "import" && kind !== "export") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  try {
    const result = await deleteImportExportJobs(kind);
    if (result.deletedCount === 0 && result.keptRunning === 0) {
      return NextResponse.json({ error: "No jobs to delete" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to delete jobs") },
      { status: 500 },
    );
  }
}
