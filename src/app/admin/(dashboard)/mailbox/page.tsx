import { requireSitePage } from "@/lib/admin-access";
import { listEmailJobs } from "@/lib/mail/jobs";
import { listMailMessages } from "@/lib/mail/mailbox";
import { MailboxManager } from "@/components/admin/mailbox-manager";

export const dynamic = "force-dynamic";

export default async function AdminMailboxPage() {
  await requireSitePage();
  const [jobs, messages] = await Promise.all([
    listEmailJobs(),
    listMailMessages(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Mailbox</h1>
      <p className="mt-2 text-sm text-gray-600">
        Email queue, delivery status, and outbox history in one place.
      </p>

      <div className="mt-8">
        <MailboxManager initialJobs={jobs} initialMessages={messages} />
      </div>
    </div>
  );
}
