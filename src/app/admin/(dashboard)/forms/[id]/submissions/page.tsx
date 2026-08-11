import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSitePage } from "@/lib/admin-access";
import { getFormById, listFormSubmissions } from "@/lib/forms";
import { PORTAL_TIMEZONE } from "@/lib/datetime-local";
import { isFormUploadValue } from "@/lib/validations/forms";

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

function previewValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (isFormUploadValue(value)) return value.originalName;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return String(value ?? "");
}

export default async function FormSubmissionsPage({ params }: Props) {
  await requireSitePage();
  const { id } = await params;
  const [form, submissions] = await Promise.all([
    getFormById(id),
    listFormSubmissions(id),
  ]);
  if (!form || form.deletedAt) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Submissions</h1>
          <p className="mt-1 text-sm text-gray-600">{form.name}</p>
        </div>
        <Link
          href={`/admin/forms/${id}`}
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to form
        </Link>
      </div>

      {submissions.length === 0 ? (
        <p className="mt-8 text-gray-600">No submissions yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Page</th>
                <th className="px-4 py-3 font-medium">Preview</th>
                <th className="px-4 py-3 font-medium text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.id} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-600">
                    {formatAdminDate(submission.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        submission.status === "new"
                          ? "text-amber-700"
                          : submission.status === "reviewed"
                            ? "text-green-700"
                            : "text-gray-500"
                      }
                    >
                      {submission.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {submission.pagePath || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {Object.entries(submission.payload)
                      .slice(0, 2)
                      .map(([key, value]) => `${key}: ${previewValue(value)}`)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/forms/${id}/submissions/${submission.id}`}
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
            {submissions.map((submission) => (
              <li key={submission.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {formatAdminDate(submission.createdAt)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {submission.pagePath || "—"}
                    </p>
                  </div>
                  <span
                    className={
                      submission.status === "new"
                        ? "text-amber-700"
                        : submission.status === "reviewed"
                          ? "text-green-700"
                          : "text-gray-500"
                    }
                  >
                    {submission.status}
                  </span>
                </div>
                <Link
                  href={`/admin/forms/${id}/submissions/${submission.id}`}
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
