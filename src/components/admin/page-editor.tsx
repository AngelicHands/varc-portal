"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePageAction, savePageAction } from "@/lib/actions";
import { isEmptyHtml } from "@/lib/html";
import { CONTENT_FONT_OPTIONS } from "@/lib/fonts";
import { makeSlug } from "@/lib/slug";
import type { PageFormValues } from "@/lib/validations/article";
import {
  layoutWithBreadcrumbOnTop,
  type TemplateLayout,
} from "@/lib/blocks/types";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { PageGalleryField } from "@/components/admin/page-gallery-field";
import { ImageSourceField } from "@/components/admin/image-source-field";
import { ContentAccessFields } from "@/components/admin/content-access-fields";
import { TemplateLayoutBuilder } from "@/components/admin/template-builder/template-layout-builder";
import { useConfirm } from "@/components/admin/use-confirm";
import { notifyAction } from "@/components/admin/admin-toast";
import {
  ARTICLE_ASIDE_PAD_COLLAPSED,
  ARTICLE_ASIDE_PAD_EXPANDED,
  AccordionPanel,
  ArticleSectionAside,
  CollapsibleSectionHeader,
  PAGE_SIDE_SECTIONS,
  useArticleSectionAsideExpanded,
  type PageSideSectionId,
} from "@/components/admin/article-section-aside";
import {
  PublishIcon,
  SaveDraftIcon,
  TrashIcon,
} from "@/components/admin/admin-action-icons";
import { IconActionButton } from "@/components/admin/icon-action-button";
import { AdminCheckbox } from "@/components/admin/admin-checkbox";

type TemplateOption = {
  key: string;
  name: string;
  description: string;
};

type Option = { id: string; label: string; depth?: number };

type Props = {
  pageId?: string;
  heading?: string;
  initial: PageFormValues;
  templates: TemplateOption[];
  defaultLayouts: Record<string, TemplateLayout>;
  articleOptions?: Option[];
  categoryOptions?: Option[];
  formOptions?: Option[];
  userOptions?: Option[];
  roleOptions?: Option[];
};

const emptyLocale = {
  title: "",
  content: "",
  metaTitle: "",
  metaDescription: "",
};

function layoutFromTemplate(
  templateKey: string,
  defaultLayouts: Record<string, TemplateLayout>,
  fallback?: TemplateLayout | null,
): TemplateLayout {
  const base = defaultLayouts[templateKey] ?? fallback ?? { sections: [] };
  return layoutWithBreadcrumbOnTop(structuredClone(base));
}

export function PageEditor({
  pageId,
  heading = "Edit page",
  initial,
  templates,
  defaultLayouts,
  articleOptions = [],
  categoryOptions = [],
  formOptions = [],
  userOptions = [],
  roleOptions = [],
}: Props) {
  const router = useRouter();
  const { ask, modal } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => {
    if (pageId || initial.layoutOverride) return initial;
    return {
      ...initial,
      layoutOverride: layoutFromTemplate(initial.templateKey, defaultLayouts),
    };
  });
  const [tab, setTab] = useState<"vi" | "en">("vi");
  const [sideSection, setSideSection] = useState<PageSideSectionId | null>(
    null,
  );
  const [contentExpanded, setContentExpanded] = useState(true);
  const [layoutExpanded, setLayoutExpanded] = useState(
    () => form.layoutOverride != null,
  );
  const asideExpanded = useArticleSectionAsideExpanded();
  const customize = form.layoutOverride != null;

  const previewSlug = useMemo(
    () => (form.locales[tab].title ? makeSlug(form.locales[tab].title) : ""),
    [form.locales, tab],
  );

  const isGallery = form.templateKey === "gallery";
  const selectedTemplate = templates.find((t) => t.key === form.templateKey);
  const isPublished = form.status === "published";

  const canPublish = Boolean(
    form.locales.vi.title.trim() &&
      (isGallery
        ? form.galleryItems.length > 0
        : form.templateKey === "blank" ||
          form.templateKey === "home" ||
          form.templateKey === "category" ||
          !isEmptyHtml(form.locales.vi.content)),
  );

  function updateLocale(
    locale: "vi" | "en",
    field: keyof typeof emptyLocale,
    value: string,
  ) {
    setForm((prev) => ({
      ...prev,
      locales: {
        ...prev.locales,
        [locale]: { ...prev.locales[locale], [field]: value },
      },
    }));
  }

  function onSave(status: "draft" | "published") {
    setError(null);
    startTransition(async () => {
      const result = await savePageAction(pageId ?? null, { ...form, status });
      if (
        !notifyAction(
          result,
          status === "published" ? "Page published" : "Page saved",
        )
      ) {
        setError(result.error);
        return;
      }
      router.push(`/admin/pages/${result.id}`);
      router.refresh();
    });
  }

  async function onDelete() {
    if (!pageId) return;
    const confirmed = await ask({
      title: "Move to trash",
      message: "Move this page to trash?",
      confirmLabel: "Move to trash",
      variant: "danger",
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deletePageAction(pageId);
      if (!notifyAction(result, "Moved to trash")) {
        setError(result.error);
        return;
      }
      router.push("/admin/pages");
      router.refresh();
    });
  }

  const locale = form.locales[tab];

  const sidePanels: Record<PageSideSectionId, React.ReactNode> = {
    properties: (
      <div className="grid min-w-0 content-start gap-5">
        <label className="block min-w-0 text-sm">
          <span className="mb-1 block font-medium">Template</span>
          <select
            value={form.templateKey}
            onChange={(e) => {
              const templateKey = e.target.value;
              setForm((prev) => ({
                ...prev,
                templateKey,
                layoutOverride: prev.layoutOverride
                  ? layoutFromTemplate(
                      templateKey,
                      defaultLayouts,
                      prev.layoutOverride as TemplateLayout,
                    )
                  : null,
              }));
            }}
            className="w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2"
          >
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {selectedTemplate?.description ||
              (isGallery
                ? "Gallery pages show a large selected image with a thumbnail strip."
                : "Choose a layout template for this page.")}{" "}
            <Link href="/admin/templates" className="underline">
              Manage templates
            </Link>
          </p>
        </label>

        <label className="block min-w-0 text-sm">
          <span className="mb-1 block font-medium">Font family</span>
          <select
            value={form.fontFamily || "default"}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, fontFamily: e.target.value }))
            }
            className="w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2"
          >
            {CONTENT_FONT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Applied to all content on this page, including headings and blocks.
          </p>
        </label>

        <label className="block min-w-0 text-sm">
          <span className="mb-1 block font-medium">Sort order</span>
          <input
            type="number"
            value={form.sortOrder}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                sortOrder: Number(e.target.value) || 0,
              }))
            }
            className="w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Controls order in the admin pages list. Navigation is managed in{" "}
            <Link href="/admin/menu" className="underline">
              Menus
            </Link>
            .
          </span>
        </label>

        <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm">
          <AdminCheckbox
            className="mt-0.5"
            checked={customize}
            onChange={(e) => {
              if (e.target.checked) {
                const existing = form.layoutOverride as TemplateLayout | null;
                setLayoutExpanded(true);
                setForm((prev) => ({
                  ...prev,
                  layoutOverride: existing
                    ? layoutWithBreadcrumbOnTop(structuredClone(existing))
                    : layoutFromTemplate(form.templateKey, defaultLayouts),
                }));
              } else {
                setForm((prev) => ({ ...prev, layoutOverride: null }));
              }
            }}
          />
          <span className="min-w-0">
            <span className="block font-medium text-gray-900">
              Customize layout
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Override this page&apos;s block layout in the center panel.
            </span>
          </span>
        </label>
      </div>
    ),
    access: (
      <div className="grid min-w-0 content-start gap-4">
        <p className="text-xs text-gray-500">
          Restrict who can open this page when it is published.
        </p>
        <ContentAccessFields
          compact
          userOptions={userOptions}
          roleOptions={roleOptions}
          value={{
            allowPublic: form.allowPublic ?? true,
            allowedUserIds: form.allowedUserIds ?? [],
            allowedRoleKeys: form.allowedRoleKeys ?? [],
          }}
          onChange={(access) =>
            setForm((prev) => ({
              ...prev,
              allowPublic: access.allowPublic,
              allowedUserIds: access.allowedUserIds,
              allowedRoleKeys: access.allowedRoleKeys,
            }))
          }
        />
      </div>
    ),
    images: (
      <div className="grid min-w-0 content-start gap-4">
        <ImageSourceField
          compact
          label="OG image"
          description="Social link previews. Empty falls back to the first gallery image on gallery pages."
          value={form.ogImageUrl ?? ""}
          onChange={(ogImageUrl) =>
            setForm((prev) => ({ ...prev, ogImageUrl }))
          }
        />
        {isGallery && form.galleryItems[0]?.url && !form.ogImageUrl ? (
          <button
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                ogImageUrl: prev.galleryItems[0]?.url ?? "",
              }))
            }
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
          >
            Use first gallery image as OG image
          </button>
        ) : null}
      </div>
    ),
    seo: (
      <div className="grid min-w-0 content-start gap-4">
        <div className="inline-flex w-full rounded-md border border-gray-300 bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTab("vi")}
            className={`flex-1 rounded px-2.5 py-1.5 font-medium transition-colors ${
              tab === "vi"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            VI
          </button>
          <button
            type="button"
            onClick={() => setTab("en")}
            className={`flex-1 rounded px-2.5 py-1.5 font-medium transition-colors ${
              tab === "en"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            EN
          </button>
        </div>
        <label className="block min-w-0 text-sm">
          <span className="mb-1 block font-medium">
            Meta title ({tab.toUpperCase()})
          </span>
          <input
            value={locale.metaTitle}
            onChange={(e) => updateLocale(tab, "metaTitle", e.target.value)}
            className="w-full min-w-0 rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block min-w-0 text-sm">
          <span className="mb-1 block font-medium">
            Meta description ({tab.toUpperCase()})
          </span>
          <textarea
            value={locale.metaDescription}
            onChange={(e) =>
              updateLocale(tab, "metaDescription", e.target.value)
            }
            rows={4}
            className="w-full min-w-0 resize-y rounded border border-gray-300 px-3 py-2"
          />
        </label>
      </div>
    ),
  };

  return (
    <>
      <div className="max-w-full min-w-0 overflow-x-clip">
        <div
          className={`w-full min-w-0 transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${
            asideExpanded
              ? ARTICLE_ASIDE_PAD_EXPANDED
              : ARTICLE_ASIDE_PAD_COLLAPSED
          }`}
        >
          <div className="mb-4 flex flex-col gap-3 sm:mb-6 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold sm:text-2xl">{heading}</h1>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                disabled={pending || undefined}
                onClick={() => onSave("draft")}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 sm:flex-none sm:px-4"
              >
                <SaveDraftIcon />
                Save draft
              </button>
              <button
                type="button"
                disabled={pending || !canPublish || undefined}
                onClick={() => onSave("published")}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:flex-none sm:px-4"
              >
                <PublishIcon />
                {isPublished ? "Update" : "Publish"}
              </button>
              {pageId ? (
                <IconActionButton
                  label="Move to trash"
                  variant="danger"
                  disabled={pending}
                  onClick={() => void onDelete()}
                >
                  <TrashIcon />
                </IconActionButton>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mb-6">
              {error}
            </p>
          ) : null}

          <div className="grid min-w-0 max-w-full gap-6">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <CollapsibleSectionHeader
                open={contentExpanded}
                onToggle={() => setContentExpanded((prev) => !prev)}
                title="Page content"
                subtitle={
                  form.locales.vi.title.trim() ||
                  form.locales.en.title.trim() ||
                  "Title, slug, and page body"
                }
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                }
              />
              <AccordionPanel
                open={contentExpanded}
                panelClassName="grid min-w-0 content-start gap-4 border-t border-gray-200 px-4 py-4 sm:px-5 sm:py-5"
              >
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("vi")}
                    className={`rounded px-3 py-1.5 text-sm ${
                      tab === "vi"
                        ? "bg-gray-900 text-white"
                        : "border border-gray-300 bg-white"
                    }`}
                  >
                    Vietnamese
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("en")}
                    className={`rounded px-3 py-1.5 text-sm ${
                      tab === "en"
                        ? "bg-gray-900 text-white"
                        : "border border-gray-300 bg-white"
                    }`}
                  >
                    English
                  </button>
                </div>
                <label className="block min-w-0 text-sm">
                  <span className="mb-1 block font-medium">
                    Title ({tab.toUpperCase()})
                  </span>
                  <input
                    value={locale.title}
                    onChange={(e) => updateLocale(tab, "title", e.target.value)}
                    className="w-full min-w-0 rounded border border-gray-300 px-3 py-2"
                  />
                </label>
                <div className="min-w-0 text-sm">
                  <span className="mb-1 block font-medium">Slug (auto)</span>
                  <p className="break-all rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600 sm:text-sm">
                    {previewSlug || "—"}
                  </p>
                </div>

                {isGallery ? (
                  <PageGalleryField
                    items={form.galleryItems}
                    onChange={(galleryItems) =>
                      setForm((prev) => ({ ...prev, galleryItems }))
                    }
                  />
                ) : null}

                <div className="block min-w-0 max-w-full text-sm">
                  <span className="mb-1 block font-medium">
                    {isGallery ? "Intro content (optional)" : "Content"}
                  </span>
                  <RichTextEditor
                    key={`${tab}-${form.templateKey}`}
                    value={locale.content}
                    onChange={(html) => updateLocale(tab, "content", html)}
                    imageAltFallback={locale.title}
                    placeholder={
                      isGallery
                        ? tab === "vi"
                          ? "Mô tả ngắn phía trên gallery…"
                          : "Optional intro above the gallery…"
                        : tab === "vi"
                          ? "Nội dung trang…"
                          : "Page content…"
                    }
                  />
                </div>
              </AccordionPanel>
            </div>

            {customize && form.layoutOverride ? (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <CollapsibleSectionHeader
                  open={layoutExpanded}
                  onToggle={() => setLayoutExpanded((prev) => !prev)}
                  title="Page layout"
                  subtitle="Customize blocks for this page only"
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                  }
                />
                <AccordionPanel
                  open={layoutExpanded}
                  panelClassName="border-t border-gray-200 px-4 py-4 sm:px-5 sm:py-5"
                >
                  <TemplateLayoutBuilder
                    layout={form.layoutOverride as TemplateLayout}
                    onChange={(layoutOverride) =>
                      setForm((prev) => ({ ...prev, layoutOverride }))
                    }
                    articleOptions={articleOptions}
                    categoryOptions={categoryOptions}
                    formOptions={formOptions}
                  />
                </AccordionPanel>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ArticleSectionAside
        sections={PAGE_SIDE_SECTIONS}
        openSection={sideSection}
        onOpenSectionChange={(section) =>
          setSideSection(section as PageSideSectionId | null)
        }
        panels={sidePanels}
      />
      {modal}
    </>
  );
}

export const emptyPageForm: PageFormValues = {
  status: "draft",
  allowPublic: true,
  allowedUserIds: [],
  allowedRoleKeys: [],
  templateKey: "custom",
  fontFamily: "default",
  ogImageUrl: "",
  layoutOverride: null,
  galleryItems: [],
  sortOrder: 0,
  locales: {
    vi: { ...emptyLocale },
    en: { ...emptyLocale },
  },
};
