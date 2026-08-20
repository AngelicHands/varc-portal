import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import { listEmailJobs } from "@/lib/mail/jobs";
import { listMailMessages } from "@/lib/mail/mailbox";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [jobs, messages] = await Promise.all([
    listEmailJobs(),
    listMailMessages(),
  ]);

  return NextResponse.json({ jobs, messages });
}
