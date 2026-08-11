import {
  FormDefinitionEditor,
} from "@/components/admin/form-definition-editor";
import { requireSitePage } from "@/lib/admin-access";
import { emptyFormDefinitionForm } from "@/lib/validations/forms";

export default async function NewFormPage() {
  await requireSitePage();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New form</h1>
      <FormDefinitionEditor
        initial={{
          ...emptyFormDefinitionForm,
          fields: (emptyFormDefinitionForm.fields ?? []).map((field) => ({ ...field })),
        }}
      />
    </div>
  );
}
