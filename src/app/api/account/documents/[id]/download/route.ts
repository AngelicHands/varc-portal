import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getObjectStream } from "@/lib/media/storage";
import { canManageUsers } from "@/lib/roles";
import { getUserDocumentById } from "@/lib/user-documents";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const doc = await getUserDocumentById(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isOwner = String(doc.userId) === session.user.id;
    const isAdmin = canManageUsers(session.user);
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const object = await getObjectStream(doc.key);
    const inline = new URL(_request.url).searchParams.get("inline") === "1";
    const headers = new Headers();
    headers.set("Content-Type", doc.contentType || object.contentType);
    headers.set(
      "Content-Disposition",
      inline
        ? `inline; filename="${doc.originalName.replace(/"/g, "")}"`
        : `attachment; filename="${doc.originalName.replace(/"/g, "")}"`,
    );
    if (object.size && Number.isFinite(object.size)) {
      headers.set("Content-Length", String(object.size));
    }

    return new Response(object.stream as never, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to download document") },
      { status: 500 },
    );
  }
}
