import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSitePage } from "@/lib/admin-access";
import { PORTAL_TIMEZONE } from "@/lib/datetime-local";
import { getMailMessageById, mailKindLabel } from "@/lib/mail/mailbox";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

function formatAdminDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: PORTAL_TIMEZONE,
  });
}

function statusClass(status: string) {
  if (status === "sent") return "text-green-700";
  if (status === "failed") return "text-red-700";
  return "text-gray-500";
}

export default async function AdminMailboxDetailPage({ params }: Props) {
  await requireSitePage();
  const { id } = await params;
  const message = await getMailMessageById(id);
  if (!message) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Outbox message</h1>
          <p className="mt-1 text-sm text-gray-600">{message.subject}</p>
        </div>
        <Link
          href="/admin/mailbox"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to mailbox
        </Link>
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Sent</p>
          <p className="mt-1 text-sm">{formatAdminDate(message.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
          <p className={`mt-1 text-sm font-medium ${statusClass(message.status)}`}>
            {message.status}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Kind</p>
          <p className="mt-1 text-sm">{mailKindLabel(message.kind)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">To</p>
          <p className="mt-1 break-all text-sm">{message.to}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">From</p>
          <p className="mt-1 break-all text-sm">{message.from}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Form</p>
          <p className="mt-1 text-sm">
            {message.formId ? (
              <Link
                href={`/admin/forms/${message.formId}`}
                className="hover:underline"
              >
                {message.formNameSnapshot || message.formId}
              </Link>
            ) : (
              message.formNameSnapshot || "—"
            )}
          </p>
        </div>
        {message.submissionId && message.formId ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Submission
            </p>
            <p className="mt-1 text-sm">
              <Link
                href={`/admin/forms/${message.formId}/submissions/${message.submissionId}`}
                className="hover:underline"
              >
                View submission
              </Link>
            </p>
          </div>
        ) : null}
        {message.error ? (
          <div className="md:col-span-2 lg:col-span-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Error</p>
            <p className="mt-1 text-sm text-red-700">{message.error}</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">Subject</h2>
        <p className="text-sm text-gray-900">{message.subject}</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">Body (text)</h2>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-gray-900">
          {message.text || "—"}
        </pre>
      </div>

      {message.html ? (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">Body (HTML preview)</h2>
          <div
            className="prose-article-wide max-w-none rounded border border-gray-100 bg-gray-50 p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: message.html }}
          />
        </div>
      ) : null}
    </div>
  );
}
