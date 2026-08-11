import { TemplateEditor } from "@/components/admin/template-builder/template-editor";
import { requireSitePage } from "@/lib/admin-access";
import { emptyLayout } from "@/lib/blocks/types";
import { listAllArticles, getLocaleContent } from "@/lib/articles";
import { listCategories, categorySelectOptions } from "@/lib/cms";
import { listFormOptions } from "@/lib/forms";

export default async function NewTemplatePage() {
  await requireSitePage();
  const [articles, categories, forms] = await Promise.all([
    listAllArticles(),
    listCategories(),
    listFormOptions(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New template</h1>
      <TemplateEditor
        initial={{
          name: "",
          description: "",
          key: "",
          isSystem: false,
          layout: emptyLayout(),
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
