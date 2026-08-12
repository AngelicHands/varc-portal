import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmissionDeleteButton } from "@/components/admin/form-submission-delete-button";
import { FormSubmissionStatusControls } from "@/components/admin/form-submission-status-controls";
import { requireSitePage } from "@/lib/admin-access";
import {
  getFormById,
  getFormSubmissionById,
} from "@/lib/forms";
import { PORTAL_TIMEZONE } from "@/lib/datetime-local";
import { isFormUploadValue } from "@/lib/validations/forms";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; submissionId: string }>;
};

function formatAdminDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: PORTAL_TIMEZONE,
  });
}

function formatAnswer(value: unknown) {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (isFormUploadValue(value)) {
    return (
      <span className="inline-flex flex-wrap items-center gap-3">
        {value.contentType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.url}
            alt={value.originalName}
            className="h-20 w-20 rounded border border-gray-200 object-cover"
          />
        ) : null}
        <a
          href={value.url}
          target="_blank"
          rel="noreferrer"
          className="text-blue-700 underline"
        >
          {value.originalName}
        </a>
        <span className="text-xs text-gray-500">
          {Math.max(1, Math.round(value.size / 1024))} KB
        </span>
      </span>
    );
  }
  if (typeof value === "string") {
    return value || "—";
  }
  return "—";
}

export default async function FormSubmissionDetailPage({ params }: Props) {
  await requireSitePage();
  const { id, submissionId } = await params;
  const [form, submission] = await Promise.all([
    getFormById(id),
    getFormSubmissionById(submissionId),
  ]);

  if (
    !form ||
    form.deletedAt ||
    !submission ||
    submission.formId !== id
  ) {
    notFound();
  }

  const fieldsByName = new Map(
    (form.fields ?? []).map((field) => [field.name, field.label]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Submission detail</h1>
          <p className="mt-1 text-sm text-gray-600">{form.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FormSubmissionDeleteButton
            submissionId={submission.id}
            formId={id}
            redirectTo={`/admin/forms/${id}/submissions`}
          />
          <Link
            href={`/admin/forms/${id}/submissions`}
            className="text-sm text-gray-600 hover:underline"
          >
            ← Back to submissions
          </Link>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Submitted</p>
          <p className="mt-1 text-sm">{formatAdminDate(submission.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Page</p>
          <p className="mt-1 font-mono text-sm">{submission.pagePath || "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
          <div className="mt-2">
            <FormSubmissionStatusControls
              submissionId={submission.id}
              currentStatus={submission.status}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Answers</h2>
        <dl className="space-y-4">
          {Object.entries(submission.payload).map(([key, value]) => (
            <div
              key={key}
              className="grid gap-1 border-b border-gray-100 pb-4 last:border-0 last:pb-0 md:grid-cols-[220px_minmax(0,1fr)]"
            >
              <dt className="text-sm font-medium text-gray-700">
                {fieldsByName.get(key) || key}
              </dt>
              <dd className="text-sm text-gray-900">{formatAnswer(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
