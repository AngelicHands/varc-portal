import { NextResponse } from "next/server";
import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  parseAdminJobsPage,
  parseAdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";
import {
  countEmailJobsByStatus,
  listEmailJobsPage,
} from "@/lib/mail/jobs";
import {
  countFailedMailMessages,
  listMailMessagesPage,
} from "@/lib/mail/mailbox";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireSiteAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobsPage = parseAdminJobsPage(url.searchParams.get("jobsPage"));
  const jobsPageSize = parseAdminJobsPageSize(
    url.searchParams.get("jobsPageSize"),
  );
  const messagesPage = parseAdminJobsPage(
    url.searchParams.get("messagesPage"),
  );
  const messagesPageSize = parseAdminJobsPageSize(
    url.searchParams.get("messagesPageSize"),
  );

  const [jobs, messages, jobCounts, failedMessages] = await Promise.all([
    listEmailJobsPage(jobsPage, jobsPageSize, { activeOnly: true }),
    listMailMessagesPage(messagesPage, messagesPageSize),
    countEmailJobsByStatus(),
    countFailedMailMessages(),
  ]);

  return NextResponse.json({
    jobs,
    messages,
    counts: {
      queued: jobCounts.queued,
      running: jobCounts.running,
      failed: jobCounts.failed + failedMessages,
    },
  });
}
