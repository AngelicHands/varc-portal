import { requireSitePage } from "@/lib/admin-access";
import { ADMIN_JOBS_DEFAULT_PAGE_SIZE } from "@/lib/admin-jobs-pagination";
import {
  countEmailJobsByStatus,
  listEmailJobsPage,
} from "@/lib/mail/jobs";
import {
  countFailedMailMessages,
  listMailMessagesPage,
} from "@/lib/mail/mailbox";
import { MailboxManager } from "@/components/admin/mailbox-manager";

export const dynamic = "force-dynamic";

export default async function AdminMailboxPage() {
  await requireSitePage();
  const [jobsPage, messagesPage, jobCounts, failedMessages] = await Promise.all([
    listEmailJobsPage(1, ADMIN_JOBS_DEFAULT_PAGE_SIZE, { activeOnly: true }),
    listMailMessagesPage(1, ADMIN_JOBS_DEFAULT_PAGE_SIZE),
    countEmailJobsByStatus(),
    countFailedMailMessages(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Mailbox</h1>
      <p className="mt-2 text-sm text-gray-600">
        Email queue, delivery status, and outbox history in one place.
      </p>

      <div className="mt-8">
        <MailboxManager
          initialJobsPage={jobsPage}
          initialMessagesPage={messagesPage}
          initialCounts={{
            queued: jobCounts.queued,
            running: jobCounts.running,
            failed: jobCounts.failed + failedMessages,
          }}
        />
      </div>
    </div>
  );
}
