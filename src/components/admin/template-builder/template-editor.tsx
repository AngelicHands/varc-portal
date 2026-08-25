"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deletePageTemplateAction,
  savePageTemplateAction,
} from "@/lib/actions";
import {
  emptyLayout,
  type TemplateLayout,
} from "@/lib/blocks/types";
import { TemplateLayoutBuilder } from "@/components/admin/template-builder/template-layout-builder";
import { useConfirm } from "@/components/admin/use-confirm";
import { notifyAction } from "@/components/admin/admin-toast";
import {
  ARTICLE_ASIDE_PAD_COLLAPSED,
  ARTICLE_ASIDE_PAD_EXPANDED,
  AccordionPanel,
  ArticleSectionAside,
  CollapsibleSectionHeader,
  TEMPLATE_SIDE_SECTIONS,
  setArticleSectionAsideExpanded,
  useArticleSectionAsideExpanded,
  type TemplateSideSectionId,
} from "@/components/admin/article-section-aside";
import { SaveDraftIcon, TrashIcon } from "@/components/admin/admin-action-icons";
import { IconActionButton } from "@/components/admin/icon-action-button";

type Option = { id: string; label: string; depth?: number };

type Props = {
  templateId?: string;
  heading?: string;
  initial: {
    name: string;
    description: string;
    key: string;
    isSystem: boolean;
    layout: TemplateLayout;
  };
  articleOptions: Option[];
  categoryOptions: Option[];
  formOptions: Option[];
};

export function TemplateEditor({
  templateId,
  heading = "Edit template",
  initial,
  articleOptions,
  categoryOptions,
  formOptions,
}: Props) {
  const router = useRouter();
  const { ask, modal } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [layout, setLayout] = useState<TemplateLayout>(
    initial.layout ?? emptyLayout(),
  );
  const [sideSection, setSideSection] = useState<TemplateSideSectionId | null>(
    null,
  );
  const [layoutExpanded, setLayoutExpanded] = useState(true);
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null);
  const [layoutSelectionActive, setLayoutSelectionActive] = useState(false);
  const asideExpanded = useArticleSectionAsideExpanded();

  const onLayoutInspectorSelectionChange = useCallback((active: boolean) => {
    setLayoutSelectionActive(active);
    if (!active) return;
    setArticleSectionAsideExpanded(true);
    setSideSection("properties");
  }, []);

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await savePageTemplateAction(templateId ?? null, {
        name,
        description,
        layout,
      });
      if (!notifyAction(result, "Template saved")) {
        setError(result.error);
        return;
      }
      router.push(`/admin/templates/${result.id}`);
      router.refresh();
    });
  }

  async function onDelete() {
    if (!templateId || initial.isSystem) return;
    const confirmed = await ask({
      title: "Delete template",
      message: "Delete this template? Pages using it may fall back to blank.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deletePageTemplateAction(templateId);
      if (!notifyAction(result, "Template deleted")) {
        setError(result.error);
        return;
      }
      router.push("/admin/templates");
      router.refresh();
    });
  }

  const sidePanels: Record<TemplateSideSectionId, React.ReactNode> = {
    properties: (
      <div className="grid min-w-0 content-start gap-5">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {layoutSelectionActive ? "Layout inspector" : "Layout"}
          </p>
          <div ref={setInspectorHost} className="min-w-0" />
          {!layoutSelectionActive ? (
            <p className="mt-2 text-xs text-gray-500">
              Select a section or block in the layout canvas to edit it here.
            </p>
          ) : null}
        </div>

        <div
          className={`grid min-w-0 content-start gap-5 ${
            layoutSelectionActive ? "border-t border-gray-200 pt-5" : ""
          }`}
        >
          {!layoutSelectionActive ? (
            <>
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-w-0 rounded border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium">Key</span>
                <p className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-600">
                  {initial.key || "(assigned on save)"}
                  {initial.isSystem ? " · system" : ""}
                </p>
              </label>
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full min-w-0 resize-y rounded border border-gray-300 px-3 py-2"
                />
              </label>
            </>
          ) : null}
        </div>
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
              <Link
                href="/admin/templates"
                className="mb-1 inline-block text-sm text-gray-600 hover:underline"
              >
                ← Templates
              </Link>
              <h1 className="text-xl font-semibold sm:text-2xl">{heading}</h1>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                disabled={pending || undefined}
                onClick={onSave}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:flex-none sm:px-4"
              >
                <SaveDraftIcon />
                Save template
              </button>
              {templateId && !initial.isSystem ? (
                <IconActionButton
                  label="Delete template"
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
                open={layoutExpanded}
                onToggle={() => setLayoutExpanded((prev) => !prev)}
                title="Template layout"
                subtitle={
                  name.trim() || "Sections and blocks for this template"
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
                  layout={layout}
                  onChange={setLayout}
                  articleOptions={articleOptions}
                  categoryOptions={categoryOptions}
                  formOptions={formOptions}
                  inspectorPlacement="external"
                  inspectorHost={inspectorHost}
                  onInspectorSelectionChange={onLayoutInspectorSelectionChange}
                />
              </AccordionPanel>
            </div>
          </div>
        </div>
      </div>

      <ArticleSectionAside
        sections={TEMPLATE_SIDE_SECTIONS}
        openSection={sideSection}
        onOpenSectionChange={(section) =>
          setSideSection(section as TemplateSideSectionId | null)
        }
        panels={sidePanels}
      />
      {modal}
    </>
  );
}
