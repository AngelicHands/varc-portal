import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/admin/template-builder/template-editor";
import { requireSitePage } from "@/lib/admin-access";
import { getPageTemplateById, parseLayout } from "@/lib/blocks/templates";
import { emptyLayout } from "@/lib/blocks/types";
import { listAllArticles, getLocaleContent } from "@/lib/articles";
import { listCategories, categorySelectOptions } from "@/lib/cms";
import { listFormOptions } from "@/lib/forms";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditTemplatePage({ params }: Props) {
  await requireSitePage();
  const { id } = await params;
  const [template, articles, categories, forms] = await Promise.all([
    getPageTemplateById(id),
    listAllArticles(),
    listCategories(),
    listFormOptions(),
  ]);
  if (!template || template.deletedAt) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit template</h1>
      <TemplateEditor
        templateId={id}
        initial={{
          name: template.name,
          description: template.description ?? "",
          key: template.key,
          isSystem: Boolean(template.isSystem),
          layout: parseLayout(template.layout) ?? emptyLayout(),
        }}
        articleOptions={articles.map((article) => ({
          id: String(article._id),
          label:
            getLocaleContent(article, "vi").title ||
            getLocaleContent(article, "en").title ||
            String(article._id),
        }))}
        categoryOptions={categorySelectOptions(categories, "vi")}
        formOptions={forms.map((form) => ({
          id: form.id,
          label:
            form.status === "published"
              ? `${form.label}`
              : `${form.label} (draft)`,
        }))}
      />
    </div>
  );
}
