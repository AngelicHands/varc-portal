import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  cancelEmailJob,
  deleteEmailJob,
  getEmailJob,
  retryEmailJob,
} from "@/lib/mail/jobs";
import { publicErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await getEmailJob(id);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
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

    if (action === "retry" || action === "resend") {
      const job = await retryEmailJob(id);
      if (!job) {
        return NextResponse.json(
          { error: "Job not found or not resendable" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, job });
    }

    if (action === "cancel") {
      const job = await cancelEmailJob(id);
      if (!job) {
        return NextResponse.json(
          { error: "Job not found or not cancellable" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, job });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to update email job") },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Props) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteEmailJob(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Job not found or still running" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
