import { PageEditor, emptyPageForm } from "@/components/admin/page-editor";
import { requirePagesPage } from "@/lib/admin-access";
import { getLocaleContent, listAllArticles } from "@/lib/articles";
import {
  listPageTemplateOptions,
  listPageTemplatesAdmin,
  parseLayout,
} from "@/lib/blocks/templates";
import { emptyLayout, type TemplateLayout } from "@/lib/blocks/types";
import { categorySelectOptions, listCategories } from "@/lib/cms";
import { listFormOptions } from "@/lib/forms";
import {
  listContentAccessRoleOptions,
  listContentAccessUserOptions,
} from "@/lib/content-access-options";

export default async function NewPagePage() {
  await requirePagesPage();
  const [
    templateOptions,
    templateDocs,
    articles,
    categories,
    forms,
    userOptions,
    roleOptions,
  ] = await Promise.all([
    listPageTemplateOptions(),
    listPageTemplatesAdmin(),
    listAllArticles(),
    listCategories(),
    listFormOptions(),
    listContentAccessUserOptions(),
    listContentAccessRoleOptions(),
  ]);

  const defaultLayouts: Record<string, TemplateLayout> = {};
  for (const doc of templateDocs) {
    defaultLayouts[doc.key] = parseLayout(doc.layout) ?? emptyLayout();
  }

  return (
    <div>
      <PageEditor
        heading="New page"
        initial={emptyPageForm}
        templates={templateOptions}
        defaultLayouts={defaultLayouts}
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
        userOptions={userOptions}
        roleOptions={roleOptions}
      />
    </div>
  );
}
