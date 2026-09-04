import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  parseAdminJobsPage,
  parseAdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";
import { buildBackupArtifactKey, putBackupArtifactStream } from "@/lib/backup/artifact-storage";
import {
  createBackupJob,
  hasActiveBackupJob,
  listBackupJobsPage,
} from "@/lib/backup/jobs";
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
    listBackupJobsPage(page, pageSize),
    hasActiveBackupJob(),
  ]);
  return NextResponse.json({ ...jobsPage, hasActive });
}

export async function POST(request: Request) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (await hasActiveBackupJob()) {
      return NextResponse.json(
        { error: "Another backup or restore job is already active" },
        { status: 409 },
      );
    }

    const formData = await request.formData();
    const kind = String(formData.get("kind") ?? "").trim();
    if (kind === "backup") {
      const job = await createBackupJob({
        kind: "backup",
        requestedByUserId: session.user.id,
        requestedByEmail: session.user.email,
        requestedByName: session.user.name,
      });
      return NextResponse.json({ ok: true, job }, { status: 201 });
    }

    if (kind !== "restore") {
      return NextResponse.json({ error: "Invalid job type" }, { status: 400 });
    }

    const confirmation = String(formData.get("confirmation") ?? "").trim();
    if (confirmation !== "RESTORE") {
      return NextResponse.json(
        { error: 'Type "RESTORE" to confirm' },
        { status: 400 },
      );
    }

    const sourceType = String(formData.get("sourceType") ?? "").trim();
    if (sourceType === "remote") {
      const remoteUrl = String(formData.get("remoteUrl") ?? "").trim();
      if (!remoteUrl) {
        return NextResponse.json(
          { error: "Remote URL is required" },
          { status: 400 },
        );
      }
      const job = await createBackupJob({
        kind: "restore",
        requestedByUserId: session.user.id,
        requestedByEmail: session.user.email,
        requestedByName: session.user.name,
        sourceType: "remote",
        sourceRemoteUrl: remoteUrl,
      });
      return NextResponse.json({ ok: true, job }, { status: 201 });
    }

    if (sourceType !== "upload") {
      return NextResponse.json({ error: "Invalid restore source" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a ZIP backup file" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ error: "Backup must be a .zip file" }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "Backup file is empty" }, { status: 400 });
    }

    const artifactFileName = `${Date.now()}-${file.name}`;
    const artifactKey = buildBackupArtifactKey(artifactFileName);
    await putBackupArtifactStream(
      artifactKey,
      Readable.fromWeb(file.stream() as never),
      file.type || "application/zip",
    );

    const job = await createBackupJob({
      kind: "restore",
      requestedByUserId: session.user.id,
      requestedByEmail: session.user.email,
      requestedByName: session.user.name,
      sourceType: "artifact",
      sourceArtifactKey: artifactKey,
      sourceFileName: file.name,
    });
    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to create job") },
      { status: 500 },
    );
  }
}
