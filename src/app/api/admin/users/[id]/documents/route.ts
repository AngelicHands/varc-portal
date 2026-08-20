import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/roles";
import {
  listUserDocuments,
  saveUserDocument,
} from "@/lib/user-documents";
import { connectDb } from "@/lib/db";
import { publicErrorMessage } from "@/lib/safe-error";
import {
  USER_DOCUMENT_KINDS,
  USER_DOCUMENT_MAX_BYTES,
  USER_DOCUMENT_MIME,
  type UserDocumentKind,
} from "@/lib/validations/qso";
import { User } from "@/models/User";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function requireAdminUserManager() {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user)) {
    return null;
  }
  return session;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireAdminUserManager();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await connectDb();
    const user = await User.findById(id).lean();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const documents = await listUserDocuments(id);
    return NextResponse.json({ ok: true, documents });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: publicErrorMessage(error, "Failed to list documents") },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await requireAdminUserManager();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await connectDb();
    const user = await User.findById(id).lean();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const kind = String(formData.get("kind") ?? "").trim() as UserDocumentKind;
    const file = formData.get("file");

    if (!USER_DOCUMENT_KINDS.includes(kind)) {
      return NextResponse.json({ ok: false, error: "Invalid document type" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }
    if (file.size > USER_DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "File too large" }, { status: 400 });
    }
    if (!USER_DOCUMENT_MIME.includes(file.type as (typeof USER_DOCUMENT_MIME)[number])) {
      return NextResponse.json({ ok: false, error: "Unsupported file type" }, { status: 400 });
    }

    const document = await saveUserDocument({
      userId: id,
      kind,
      uploadedByUserId: session.user.id,
      file,
    });

    return NextResponse.json({ ok: true, document });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: publicErrorMessage(error, "Failed to upload document") },
      { status: 500 },
    );
  }
}
