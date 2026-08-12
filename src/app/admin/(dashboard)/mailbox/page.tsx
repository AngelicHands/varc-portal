import Link from "next/link";
import { requireSitePage } from "@/lib/admin-access";
import { PORTAL_TIMEZONE } from "@/lib/datetime-local";
import { listMailMessages, mailKindLabel } from "@/lib/mail/mailbox";

export const dynamic = "force-dynamic";

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

export default async function AdminMailboxPage() {
  await requireSitePage();
  const messages = await listMailMessages();

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold">Mailbox</h1>
        <p className="mt-1 text-sm text-gray-600">
          Outbox of emails sent by the portal (form confirmation copies, etc.).
        </p>
      </div>

      {messages.length === 0 ? (
        <p className="mt-8 text-gray-600">No messages sent yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">To</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-600">
                    {formatAdminDate(message.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{message.to}</td>
                  <td className="px-4 py-3 text-gray-900">
                    <span className="line-clamp-1">{message.subject}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {mailKindLabel(message.kind)}
                  </td>
                  <td className={`px-4 py-3 ${statusClass(message.status)}`}>
                    {message.status}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/mailbox/${message.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-gray-100 md:hidden">
            {messages.map((message) => (
              <li key={message.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{message.subject}</p>
                    <p className="text-sm text-gray-600">{message.to}</p>
                    <p className="text-xs text-gray-500">
                      {formatAdminDate(message.createdAt)}
                    </p>
                  </div>
                  <span className={statusClass(message.status)}>
                    {message.status}
                  </span>
                </div>
                <Link
                  href={`/admin/mailbox/${message.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  View details
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
