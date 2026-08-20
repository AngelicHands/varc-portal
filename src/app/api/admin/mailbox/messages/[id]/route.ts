import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  deleteMailMessage,
  resendMailMessage,
} from "@/lib/mail/mailbox";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: Props) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteMailMessage(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: Props) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as { action?: string };
    const action = body.action?.trim();

    if (action === "resend") {
      const job = await resendMailMessage(id);
      if (!job) {
        return NextResponse.json(
          { error: "Message not found or not resendable" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, job });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to update message") },
      { status: 500 },
    );
  }
}
