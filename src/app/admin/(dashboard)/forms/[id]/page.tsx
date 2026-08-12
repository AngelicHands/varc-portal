import { notFound } from "next/navigation";
import { FormDefinitionEditor } from "@/components/admin/form-definition-editor";
import { requireSitePage } from "@/lib/admin-access";
import { getFormById, countNewFormSubmissions, toAdminFormValues } from "@/lib/forms";

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
      <div>
        <h1 className="text-2xl font-semibold">Edit form</h1>
        <p className="mt-1 text-sm text-gray-600">
          Key: <span className="font-mono">{form.key}</span>
        </p>
      </div>

      <FormDefinitionEditor
        formId={id}
        newSubmissionCount={newCount}
        initial={{
          key: form.key,
          ...toAdminFormValues(form),
        }}
      />
    </div>
  );
}
