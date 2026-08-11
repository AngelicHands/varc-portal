import Link from "next/link";
import { notFound } from "next/navigation";
import { FormDefinitionEditor } from "@/components/admin/form-definition-editor";
import { requireSitePage } from "@/lib/admin-access";
import { getFormById, countNewFormSubmissions } from "@/lib/forms";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditFormPage({ params }: Props) {
  await requireSitePage();
  const { id } = await params;
  const [form, newCount] = await Promise.all([
    getFormById(id),
    countNewFormSubmissions(id),
  ]);
  if (!form || form.deletedAt) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit form</h1>
          <p className="mt-1 text-sm text-gray-600">
            Key: <span className="font-mono">{form.key}</span>
          </p>
        </div>
        <Link
          href={`/admin/forms/${id}/submissions`}
          className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          View submissions{newCount > 0 ? ` (${newCount} new)` : ""}
        </Link>
      </div>

      <FormDefinitionEditor
        formId={id}
        initial={{
          key: form.key,
          name: form.name,
          description: form.description ?? "",
          status: form.status,
          submitLabel: form.submitLabel ?? "Send",
          successMessage:
            form.successMessage ?? "Thank you. Your submission has been received.",
          fields: (form.fields ?? []).map((field) => ({
            id: field.id,
            type: field.type,
            name: field.name,
            label: field.label,
            required: Boolean(field.required),
            placeholder: field.placeholder ?? "",
            helpText: field.helpText ?? "",
            width: field.width ?? "full",
            options: (field.options ?? []).map((option) => ({
              label: option.label,
              value: option.value,
            })),
          })),
        }}
      />
    </div>
  );
}
