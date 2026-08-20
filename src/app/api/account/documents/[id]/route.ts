import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/roles";
import {
  deleteUserDocumentForUser,
  getUserDocumentById,
} from "@/lib/user-documents";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const doc = await getUserDocumentById(id);
    if (!doc) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const isOwner = String(doc.userId) === session.user.id;
    const isAdmin = canManageUsers(session.user);
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deleted = await deleteUserDocumentForUser(id, String(doc.userId));
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: publicErrorMessage(error, "Failed to delete document") },
      { status: 500 },
    );
  }
}
