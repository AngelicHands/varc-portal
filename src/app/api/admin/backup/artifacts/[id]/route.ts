import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import { getBackupArtifactStream } from "@/lib/backup/artifact-storage";
import { getBackupJobDocument } from "@/lib/backup/jobs";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const job = await getBackupJobDocument(id);
    if (!job?.artifactKey || job.status !== "succeeded") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const artifact = await getBackupArtifactStream(job.artifactKey);
    const headers = new Headers();
    headers.set("Content-Type", artifact.contentType || "application/zip");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${job.artifactFileName || "varc-backup.zip"}"`,
    );
    if (artifact.size && Number.isFinite(artifact.size)) {
      headers.set("Content-Length", String(artifact.size));
    }

    return new Response(artifact.stream as never, {
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to download backup") },
      { status: 500 },
    );
  }
}
