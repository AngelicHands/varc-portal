import { notFound } from "next/navigation";
import { PageEditor, emptyPageForm } from "@/components/admin/page-editor";
import { requirePagesPage } from "@/lib/admin-access";
import { getLocaleContent, listAllArticles } from "@/lib/articles";
import {
  resolvePageTemplateKey,
  listPageTemplateOptions,
  listPageTemplatesAdmin,
  parseLayout,
} from "@/lib/blocks/templates";
import { emptyLayout, type TemplateLayout } from "@/lib/blocks/types";
import {
  categorySelectOptions,
  getPageById,
  getPageLocale,
  listCategories,
} from "@/lib/cms";
import { normalizeEditorHtml } from "@/lib/html";
import { listFormOptions } from "@/lib/forms";
import {
  listContentAccessRoleOptions,
  listContentAccessUserOptions,
} from "@/lib/content-access-options";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditPagePage({ params }: Props) {
  await requirePagesPage();

  const { id } = await params;
  const [
    page,
    templateOptions,
    templateDocs,
    articles,
    categories,
    forms,
    userOptions,
    roleOptions,
  ] = await Promise.all([
    getPageById(id),
    listPageTemplateOptions(),
    listPageTemplatesAdmin(),
    listAllArticles(),
    listCategories(),
    listFormOptions(),
    listContentAccessUserOptions(),
    listContentAccessRoleOptions(),
  ]);
  if (!page || page.deletedAt) notFound();

  const vi = getPageLocale(page, "vi");
  const en = getPageLocale(page, "en");
  const templateKey = resolvePageTemplateKey(page);
  const galleryItems = (page.galleryItems ?? [])
    .filter((item) => item?.mediaId && item?.url)
    .map((item) => ({
      mediaId: String(item.mediaId),
      url: String(item.url),
      alt: String(item.alt ?? ""),
      originalName: String(item.originalName ?? ""),
    }));

  const defaultLayouts: Record<string, TemplateLayout> = {};
  for (const doc of templateDocs) {
    defaultLayouts[doc.key] = parseLayout(doc.layout) ?? emptyLayout();
  }

  return (
    <div>
      <PageEditor
        pageId={id}
        heading="Edit page"
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
        initial={{
          ...emptyPageForm,
          status: page.status === "published" ? "published" : "draft",
          allowPublic: page.allowPublic !== false,
          allowedUserIds: (page.allowedUserIds ?? []).map(String),
          allowedRoleKeys: (page.allowedRoleKeys ?? []).map(String),
          templateKey,
          fontFamily: page.fontFamily?.trim() || "default",
          ogImageUrl: page.ogImageUrl?.trim() ?? "",
          layoutOverride: parseLayout(page.layoutOverride) ?? null,
          galleryItems,
          sortOrder: page.sortOrder ?? 0,
          locales: {
            vi: {
              title: vi.title,
              content: normalizeEditorHtml(vi.content),
              metaTitle: vi.metaTitle,
              metaDescription: vi.metaDescription,
            },
            en: {
              title: en.title,
              content: normalizeEditorHtml(en.content),
              metaTitle: en.metaTitle,
              metaDescription: en.metaDescription,
            },
          },
        }}
      />
    </div>
  );
}
