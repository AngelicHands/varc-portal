"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  createBlock,
  createSection,
  resolveBlockLocaleText,
  resolveSectionSpacing,
  resolveSectionTextAlign,
  type BlockAlign,
  type BlockContentLocale,
  type SectionSpacing,
  type SectionTextAlign,
  type TemplateBlock,
  type TemplateLayout,
  type TemplateSection,
} from "@/lib/blocks/types";
import {
  BLOCK_PALETTE,
  BLOCK_TYPE_LABELS,
  type BlockPaletteItem,
} from "@/lib/blocks/labels";
import { MediaPickerModal } from "@/components/admin/media-picker-modal";
import { PageGalleryField } from "@/components/admin/page-gallery-field";
import type { PageGalleryItemValues } from "@/lib/validations/article";

type Option = { id: string; label: string; depth?: number };

type BuilderSelection =
  | { kind: "section"; sectionId: string }
  | { kind: "block"; sectionId: string; blockId: string };

function blockPreviewLabel(block: TemplateBlock): string {
  if (block.type === "heading") {
    const vi = resolveBlockLocaleText(block.source, "vi").text;
    const en = resolveBlockLocaleText(block.source, "en").text;
    if (block.settings.bindPageTitle === true) return "← page title";
    return vi || en || "Untitled heading";
  }
  if (block.type === "articleList") {
    const variant = String(block.settings.variant ?? "grid");
    if (variant === "spotlight") return "Spotlight (1:3)";
    return "Article list (grid)";
  }
  if (block.type === "richText" || block.type === "html") {
    const html =
      block.source.locales?.vi?.html ||
      block.source.locales?.en?.html ||
      block.source.html ||
      "";
    const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return plain ? plain.slice(0, 48) : BLOCK_TYPE_LABELS[block.type];
  }
  if (block.type === "formEmbed") {
    return block.source.formId ? "Selected form" : "Choose a form";
  }
  return BLOCK_TYPE_LABELS[block.type];
}

type Props = {
  layout: TemplateLayout;
  onChange: (layout: TemplateLayout) => void;
  articleOptions?: Option[];
  categoryOptions?: Option[];
  formOptions?: Option[];
};

type DragPayload =
  | { kind: "section"; sectionId: string }
  | { kind: "block"; sectionId: string; blockId: string }
  | { kind: "palette"; item: BlockPaletteItem };

type DropTarget =
  | { kind: "section-end"; sectionId: string }
  | { kind: "block-before"; sectionId: string; blockId: string }
  | { kind: "section-before"; sectionId: string }
  | { kind: "section-after" };

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to > items.length
  ) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  const insertAt = from < to ? to - 1 : to;
  next.splice(insertAt, 0, item!);
  return next;
}

function cloneLayout(layout: TemplateLayout): TemplateLayout {
  return structuredClone(layout);
}

function updateSection(
  layout: TemplateLayout,
  sectionId: string,
  updater: (section: TemplateSection) => TemplateSection,
): TemplateLayout {
  return {
    sections: layout.sections.map((section) =>
      section.id === sectionId ? updater(section) : section,
    ),
  };
}

function updateBlock(
  layout: TemplateLayout,
  sectionId: string,
  blockId: string,
  updater: (block: TemplateBlock) => TemplateBlock,
): TemplateLayout {
  return updateSection(layout, sectionId, (section) => ({
    ...section,
    blocks: section.blocks.map((block) =>
      block.id === blockId ? updater(block) : block,
    ),
  }));
}

function removeBlock(
  layout: TemplateLayout,
  sectionId: string,
  blockId: string,
): { layout: TemplateLayout; block: TemplateBlock | null } {
  const next = cloneLayout(layout);
  const section = next.sections.find((s) => s.id === sectionId);
  if (!section) return { layout: next, block: null };
  const index = section.blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return { layout: next, block: null };
  const [block] = section.blocks.splice(index, 1);
  return { layout: next, block: block ?? null };
}

function insertBlock(
  layout: TemplateLayout,
  sectionId: string,
  block: TemplateBlock,
  index: number,
): TemplateLayout {
  return updateSection(layout, sectionId, (section) => {
    const blocks = [...section.blocks];
    const at = Math.max(0, Math.min(index, blocks.length));
    blocks.splice(at, 0, block);
    return { ...section, blocks };
  });
}

export function TemplateLayoutBuilder({
  layout,
  onChange,
  articleOptions = [],
  categoryOptions = [],
  formOptions = [],
}: Props) {
  const [selection, setSelection] = useState<BuilderSelection | null>(null);
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const dragRef = useRef<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  const selectedBlock = useMemo(() => {
    if (!selection || selection.kind !== "block") return null;
    const section = layout.sections.find((s) => s.id === selection.sectionId);
    const block = section?.blocks.find((b) => b.id === selection.blockId);
    return block && section
      ? { sectionId: section.id, block }
      : null;
  }, [layout, selection]);

  const selectedSection = useMemo(() => {
    if (!selection || selection.kind !== "section") return null;
    const section = layout.sections.find((s) => s.id === selection.sectionId);
    return section ? { sectionId: section.id, section } : null;
  }, [layout, selection]);

  function beginDrag(payload: DragPayload, e: DragEvent) {
    dragRef.current = payload;
    setDrag(payload);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "template-layout-drag");
  }

  function clearDrag() {
    dragRef.current = null;
    setDrag(null);
    setDropTarget(null);
  }

  function addSection() {
    onChange({
      sections: [...layout.sections, createSection()],
    });
  }

  function createFromPalette(item: BlockPaletteItem): TemplateBlock {
    return createBlock(item.type, {
      source: {
        ...(item.partial?.source as TemplateBlock["source"] | undefined),
      },
      settings: { ...(item.partial?.settings ?? {}) },
    });
  }

  function addPaletteItem(item: BlockPaletteItem) {
    const sectionId =
      selection?.kind === "block"
        ? selection.sectionId
        : selection?.kind === "section"
          ? selection.sectionId
          : layout.sections[layout.sections.length - 1]?.id;
    const block = createFromPalette(item);
    if (!sectionId) {
      const section = createSection([block]);
      onChange({ sections: [section] });
      setSelection({ kind: "block", sectionId: section.id, blockId: block.id });
      return;
    }
    onChange(
      updateSection(layout, sectionId, (section) => ({
        ...section,
        blocks: [...section.blocks, block],
      })),
    );
    setSelection({ kind: "block", sectionId, blockId: block.id });
  }

  function applyBlockDrop(target: DropTarget) {
    const current = dragRef.current;
    if (
      !current ||
      current.kind === "section" ||
      target.kind === "section-before" ||
      target.kind === "section-after"
    ) {
      return;
    }

    let working = cloneLayout(layout);
    let block: TemplateBlock | null = null;

    if (current.kind === "palette") {
      block = createFromPalette(current.item);
    } else {
      const removed = removeBlock(working, current.sectionId, current.blockId);
      working = removed.layout;
      block = removed.block;
    }
    if (!block) {
      clearDrag();
      return;
    }

    const destSection = working.sections.find((s) => s.id === target.sectionId);
    if (!destSection) {
      clearDrag();
      return;
    }

    let insertIndex = destSection.blocks.length;
    if (target.kind === "block-before") {
      const idx = destSection.blocks.findIndex((b) => b.id === target.blockId);
      insertIndex = idx < 0 ? destSection.blocks.length : idx;
    }

    working = insertBlock(working, target.sectionId, block, insertIndex);
    onChange(working);
    setSelection({ kind: "block", sectionId: target.sectionId, blockId: block.id });
    clearDrag();
  }

  function onSectionReorderDrop(target: DropTarget) {
    const current = dragRef.current;
    if (!current || current.kind !== "section") return;

    const from = layout.sections.findIndex((s) => s.id === current.sectionId);
    if (from < 0) {
      clearDrag();
      return;
    }

    let to: number;
    if (target.kind === "section-after") {
      to = layout.sections.length;
    } else if (target.kind === "section-before") {
      to = layout.sections.findIndex((s) => s.id === target.sectionId);
    } else {
      clearDrag();
      return;
    }

    if (to < 0) {
      clearDrag();
      return;
    }

    onChange({ sections: moveItem(layout.sections, from, to) });
    clearDrag();
  }

  function allowBlockDrop(e: DragEvent, target: DropTarget) {
    const current = dragRef.current;
    if (
      !current ||
      current.kind === "section" ||
      target.kind === "section-before" ||
      target.kind === "section-after"
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(target);
  }

  function allowSectionDrop(e: DragEvent, target: DropTarget) {
    const current = dragRef.current;
    if (!current || current.kind !== "section") return;
    if (
      target.kind === "section-before" &&
      current.sectionId === target.sectionId
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(target);
  }

  function patchSelectedSection(
    updater: (section: TemplateSection) => TemplateSection,
  ) {
    if (!selectedSection) return;
    onChange(
      updateSection(layout, selectedSection.sectionId, updater),
    );
  }

  function patchSelected(updater: (block: TemplateBlock) => TemplateBlock) {
    if (!selectedBlock) return;
    onChange(
      updateBlock(
        layout,
        selectedBlock.sectionId,
        selectedBlock.block.id,
        updater,
      ),
    );
  }

  const isDraggingBlock = drag?.kind === "block" || drag?.kind === "palette";
  const isDraggingSection = drag?.kind === "section";

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_280px]">
      <aside className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Blocks
        </p>
        <div className="grid gap-1">
          {BLOCK_PALETTE.map((item) => (
            <button
              key={item.id}
              type="button"
              draggable
              onDragStart={(e) => beginDrag({ kind: "palette", item }, e)}
              onDragEnd={clearDrag}
              onClick={() => addPaletteItem(item)}
              className="cursor-grab rounded border border-gray-200 px-2 py-1.5 text-left text-sm hover:bg-gray-50 active:cursor-grabbing"
              title={item.description ?? "Drag onto a section, or click to add"}
            >
              <span className="block font-medium">{item.label}</span>
              {item.description ? (
                <span className="mt-0.5 block text-[11px] text-gray-500">
                  {item.description}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={addSection}
          className="mt-3 w-full rounded bg-gray-900 px-2 py-1.5 text-sm text-white hover:bg-black"
        >
          Add section
        </button>
      </aside>

      <div className="space-y-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
        {layout.sections.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">
            Empty layout. Add a section, then drag blocks into it.
          </p>
        ) : null}
        {layout.sections.map((section) => {
          const dropOnEnd =
            dropTarget?.kind === "section-end" &&
            dropTarget.sectionId === section.id;
          const dropBeforeSection =
            dropTarget?.kind === "section-before" &&
            dropTarget.sectionId === section.id;
          const sectionSelected =
            selection?.kind === "section" &&
            selection.sectionId === section.id;

          return (
            <div key={section.id} className="space-y-1">
              {isDraggingSection ? (
                <div
                  onDragOver={(e) =>
                    allowSectionDrop(e, {
                      kind: "section-before",
                      sectionId: section.id,
                    })
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSectionReorderDrop({
                      kind: "section-before",
                      sectionId: section.id,
                    });
                  }}
                  className={`rounded transition ${
                    dropBeforeSection
                      ? "h-2 bg-blue-500"
                      : "h-2 bg-transparent hover:bg-blue-100"
                  }`}
                  aria-hidden
                />
              ) : null}
              <div
                onDragOver={(e) => {
                  if (isDraggingSection) return;
                  if (isDraggingBlock) {
                    allowBlockDrop(e, {
                      kind: "section-end",
                      sectionId: section.id,
                    });
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isDraggingSection) return;
                  applyBlockDrop({ kind: "section-end", sectionId: section.id });
                }}
                onDragLeave={() => {
                  setDropTarget((current) => {
                    if (!current || current.kind === "section-before") {
                      return current;
                    }
                    if (current.kind === "section-after") return current;
                    return current.sectionId === section.id ? null : current;
                  });
                }}
                className={`rounded-lg border bg-white p-3 transition ${
                  sectionSelected
                    ? "border-blue-500 ring-2 ring-blue-500/20"
                    : dropOnEnd
                      ? "border-gray-900 ring-2 ring-gray-900/20"
                      : "border-gray-200"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        beginDrag({ kind: "section", sectionId: section.id }, e);
                      }}
                      onDragEnd={clearDrag}
                      className="cursor-grab rounded px-0.5 py-0.5 text-gray-400 hover:bg-gray-50 active:cursor-grabbing"
                      title="Drag to reorder sections"
                      aria-hidden
                    >
                      ⠿
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSelection({ kind: "section", sectionId: section.id })
                      }
                      className={`min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs font-medium hover:bg-gray-50 ${
                        sectionSelected ? "text-blue-700" : "text-gray-500"
                      }`}
                    >
                      Section · {section.blocks.length} block
                      {section.blocks.length === 1 ? "" : "s"}
                    </button>
                  </div>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => {
                    onChange({
                      sections: layout.sections.filter(
                        (s) => s.id !== section.id,
                      ),
                    });
                    if (selection?.sectionId === section.id) setSelection(null);
                  }}
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-12 gap-2">
                {section.blocks.map((block) => {
                  const active =
                    selection?.kind === "block" &&
                    selection.sectionId === section.id &&
                    selection.blockId === block.id;
                  const dropBefore =
                    dropTarget?.kind === "block-before" &&
                    dropTarget.sectionId === section.id &&
                    dropTarget.blockId === block.id;
                  const span = Math.min(
                    12,
                    Math.max(1, block.colSpan.desktop),
                  );

                  return (
                    <div
                      key={block.id}
                      className="flex flex-col gap-1"
                      style={{
                        gridColumn: `span ${span} / span ${span}`,
                      }}
                    >
                      <div
                        onDragOver={(e) =>
                          allowBlockDrop(e, {
                            kind: "block-before",
                            sectionId: section.id,
                            blockId: block.id,
                          })
                        }
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          applyBlockDrop({
                            kind: "block-before",
                            sectionId: section.id,
                            blockId: block.id,
                          });
                        }}
                        className={`h-2 rounded transition ${
                          dropBefore
                            ? "bg-gray-900"
                            : isDraggingBlock
                              ? "bg-transparent hover:bg-gray-200"
                              : "bg-transparent"
                        }`}
                        aria-hidden
                      />
                      <div className="group relative">
                        <button
                          type="button"
                          draggable
                          onDragStart={(e: DragEvent) => {
                            e.stopPropagation();
                            beginDrag(
                              {
                                kind: "block",
                                sectionId: section.id,
                                blockId: block.id,
                              },
                              e,
                            );
                          }}
                          onDragEnd={clearDrag}
                          onClick={() =>
                            setSelection({
                              kind: "block",
                              sectionId: section.id,
                              blockId: block.id,
                            })
                          }
                          className={`w-full cursor-grab rounded border px-2 py-3 pr-8 text-left text-sm active:cursor-grabbing ${
                            active
                              ? "border-gray-900 bg-gray-900 text-white"
                              : "border-gray-200 bg-gray-50 text-gray-800 hover:border-gray-400"
                          }`}
                        >
                          <span className="font-medium">
                            {BLOCK_TYPE_LABELS[block.type]}
                          </span>
                          <span className="mt-1 block truncate text-[11px] opacity-70">
                            {blockPreviewLabel(block)}
                          </span>
                          <span className="mt-0.5 block text-[11px] opacity-60">
                            span {block.colSpan.desktop}/12 · {block.align}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Remove block"
                          aria-label="Remove block"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChange(
                              updateSection(layout, section.id, (s) => ({
                                ...s,
                                blocks: s.blocks.filter((b) => b.id !== block.id),
                              })),
                            );
                            if (
                              selection?.kind === "block" &&
                              selection.sectionId === section.id &&
                              selection.blockId === block.id
                            ) {
                              setSelection(null);
                            }
                          }}
                          className={`absolute top-1.5 right-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded border text-xs transition ${
                            active
                              ? "border-white/30 bg-white/10 text-white opacity-100 hover:bg-red-500 hover:border-red-500"
                              : "border-gray-200 bg-white text-gray-500 opacity-0 shadow-sm group-hover:opacity-100 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                          }`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {section.blocks.length === 0 || isDraggingBlock ? (
                <div
                  onDragOver={(e) =>
                    allowBlockDrop(e, {
                      kind: "section-end",
                      sectionId: section.id,
                    })
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyBlockDrop({
                      kind: "section-end",
                      sectionId: section.id,
                    });
                  }}
                  className={`mt-2 rounded border border-dashed px-3 py-6 text-center text-xs ${
                    dropOnEnd
                      ? "border-gray-900 bg-gray-100 text-gray-900"
                      : "border-gray-300 text-gray-400"
                  }`}
                >
                  {section.blocks.length === 0
                    ? "Drop blocks here"
                    : "Drop here to add at end of section"}
                </div>
              ) : null}
              </div>
            </div>
          );
        })}
        {isDraggingSection && layout.sections.length > 0 ? (
          <div
            onDragOver={(e) => allowSectionDrop(e, { kind: "section-after" })}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSectionReorderDrop({ kind: "section-after" });
            }}
            className={`rounded transition ${
              dropTarget?.kind === "section-after"
                ? "h-2 bg-blue-500"
                : "h-2 bg-transparent hover:bg-blue-100"
            }`}
            aria-hidden
          />
        ) : null}
      </div>

      <aside className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Inspector
        </p>
        {selection?.kind === "section" && selectedSection ? (
          <SectionInspector
            section={selectedSection.section}
            onChange={(section) => patchSelectedSection(() => section)}
          />
        ) : selection?.kind === "block" && selectedBlock ? (
          <BlockInspector
            block={selectedBlock.block}
            articleOptions={articleOptions}
            categoryOptions={categoryOptions}
            formOptions={formOptions}
            onChange={(block) => patchSelected(() => block)}
            onPickImage={() => setMediaOpen(true)}
            onRemove={() => {
              onChange(
                updateSection(layout, selectedBlock.sectionId, (section) => ({
                  ...section,
                  blocks: section.blocks.filter(
                    (b) => b.id !== selectedBlock.block.id,
                  ),
                })),
              );
              setSelection(null);
            }}
          />
        ) : (
          <p className="text-sm text-gray-500">
            Select a section or block to edit.
          </p>
        )}
      </aside>

      <MediaPickerModal
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(media) => {
          patchSelected((block) => ({
            ...block,
            source: {
              ...block.source,
              mediaId: media.id,
              url: media.url,
              alt: media.alt,
            },
          }));
          setMediaOpen(false);
        }}
      />
    </div>
  );
}

function SectionInspector({
  section,
  onChange,
}: {
  section: TemplateSection;
  onChange: (section: TemplateSection) => void;
}) {
  const spacing = resolveSectionSpacing(section);
  const textAlign = resolveSectionTextAlign(section);

  function setSpacingSide(
    kind: "padding" | "margin",
    side: keyof SectionSpacing,
    value: number,
  ) {
    const next = Math.min(500, Math.max(0, Number.isFinite(value) ? value : 0));
    onChange({
      ...section,
      [kind]: {
        ...spacing[kind],
        [side]: next,
      },
    });
  }

  function renderSpacingGroup(
    label: string,
    kind: "padding" | "margin",
    values: SectionSpacing,
  ) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {label} (px)
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <label key={`${kind}-${side}`} className="block">
              <span className="mb-1 block text-xs capitalize text-gray-500">
                {side}
              </span>
              <input
                type="number"
                min={0}
                max={500}
                value={values[side]}
                onChange={(e) =>
                  setSpacingSide(kind, side, Number(e.target.value))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5"
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium">Section</p>
      <p className="text-xs text-gray-500">
        {section.blocks.length} block{section.blocks.length === 1 ? "" : "s"}
      </p>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-500">Text alignment</span>
        <select
          value={textAlign}
          onChange={(e) =>
            onChange({
              ...section,
              textAlign: e.target.value as SectionTextAlign,
            })
          }
          className="w-full rounded border border-gray-300 px-2 py-1.5"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>

      {renderSpacingGroup("Padding", "padding", spacing.padding)}
      {renderSpacingGroup("Margin", "margin", spacing.margin)}
    </div>
  );
}

function BlockInspector({
  block,
  onChange,
  onPickImage,
  onRemove,
  articleOptions,
  categoryOptions,
  formOptions,
}: {
  block: TemplateBlock;
  onChange: (block: TemplateBlock) => void;
  onPickImage: () => void;
  onRemove: () => void;
  articleOptions: Option[];
  categoryOptions: Option[];
  formOptions: Option[];
}) {
  const [localeTab, setLocaleTab] = useState<BlockContentLocale>("vi");

  function setSpan(key: "mobile" | "tablet" | "desktop", value: number) {
    onChange({
      ...block,
      colSpan: {
        ...block.colSpan,
        [key]: Math.min(12, Math.max(1, value || 1)),
      },
    });
  }

  function updateLocaleField(
    locale: BlockContentLocale,
    field: "text" | "href" | "html",
    value: string,
  ) {
    const locales = {
      vi: { text: "", href: "", html: "", ...block.source.locales?.vi },
      en: { text: "", href: "", html: "", ...block.source.locales?.en },
    };
    locales[locale] = { ...locales[locale], [field]: value };
    // Keep legacy fields in sync with Vietnamese for older readers.
    const patch: Record<string, unknown> = { locales };
    if (locale === "vi" && field === "text") patch.text = value;
    if (locale === "vi" && field === "href") patch.href = value;
    if (locale === "vi" && field === "html") patch.html = value;
    onChange({
      ...block,
      source: { ...block.source, ...patch },
    });
  }

  const localeContent = {
    text:
      block.source.locales?.[localeTab]?.text ??
      (localeTab === "vi" ? (block.source.text ?? "") : ""),
    href:
      block.source.locales?.[localeTab]?.href ??
      (localeTab === "vi" ? (block.source.href ?? "") : ""),
    html:
      block.source.locales?.[localeTab]?.html ??
      (localeTab === "vi" ? (block.source.html ?? "") : ""),
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">{BLOCK_TYPE_LABELS[block.type]}</p>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-500">Align</span>
        <select
          value={block.align}
          onChange={(e) =>
            onChange({ ...block, align: e.target.value as BlockAlign })
          }
          className="w-full rounded border border-gray-300 px-2 py-1.5"
        >
          <option value="stretch">Stretch</option>
          <option value="start">Start</option>
          <option value="center">Center</option>
          <option value="end">End</option>
        </select>
      </label>

      <div className="grid grid-cols-3 gap-2">
        {(["mobile", "tablet", "desktop"] as const).map((bp) => (
          <label key={bp} className="block">
            <span className="mb-1 block text-xs text-gray-500 capitalize">
              {bp}
            </span>
            <input
              type="number"
              min={1}
              max={12}
              value={block.colSpan[bp]}
              onChange={(e) => setSpan(bp, Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            />
          </label>
        ))}
      </div>

      {block.type === "heading" ||
      block.type === "richText" ||
      block.type === "html" ? (
        <div className="flex gap-1">
          {(["vi", "en"] as const).map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => setLocaleTab(locale)}
              className={`rounded px-2 py-1 text-xs ${
                localeTab === locale
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 text-gray-700"
              }`}
            >
              {locale.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}

      {block.type === "heading" ? (
        <>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={block.settings.bindPageTitle === true}
              onChange={(e) =>
                onChange({
                  ...block,
                  settings: {
                    ...block.settings,
                    bindPageTitle: e.target.checked,
                  },
                })
              }
            />
            Bind page title
          </label>
          {block.settings.bindPageTitle !== true ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">
                  Title / heading ({localeTab.toUpperCase()})
                </span>
                <input
                  value={localeContent.text}
                  onChange={(e) =>
                    updateLocaleField(localeTab, "text", e.target.value)
                  }
                  placeholder={
                    localeTab === "vi" ? "Tiêu đề…" : "Heading title…"
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">
                  Link URL (optional, {localeTab.toUpperCase()})
                </span>
                <input
                  value={localeContent.href}
                  onChange={(e) =>
                    updateLocaleField(localeTab, "href", e.target.value)
                  }
                  placeholder="/pages/…"
                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>
            </>
          ) : (
            <p className="text-xs text-gray-500">
              Heading text comes from the page title in each locale.
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Level</span>
            <input
              type="number"
              min={1}
              max={4}
              value={Number(block.settings.level ?? 2)}
              onChange={(e) =>
                onChange({
                  ...block,
                  settings: {
                    ...block.settings,
                    level: Number(e.target.value) || 2,
                  },
                })
              }
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            />
          </label>
        </>
      ) : null}

      {block.type === "richText" || block.type === "html" ? (
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">
            HTML ({localeTab.toUpperCase()})
          </span>
          <textarea
            rows={6}
            value={localeContent.html}
            onChange={(e) =>
              updateLocaleField(localeTab, "html", e.target.value)
            }
            className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
          />
        </label>
      ) : null}

      {block.type === "image" ? (
        <div className="space-y-2">
          {block.source.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.source.url}
              alt=""
              className="h-24 w-full rounded object-cover"
            />
          ) : null}
          <button
            type="button"
            onClick={onPickImage}
            className="rounded border border-gray-300 px-2 py-1.5 hover:bg-gray-50"
          >
            Choose image
          </button>
        </div>
      ) : null}

      {block.type === "gallery" ? (
        <>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={block.settings.usePageGallery === true}
              onChange={(e) =>
                onChange({
                  ...block,
                  settings: {
                    ...block.settings,
                    usePageGallery: e.target.checked,
                  },
                })
              }
            />
            Use page gallery items
          </label>
          {block.settings.usePageGallery !== true ? (
            <PageGalleryField
              items={(block.source.galleryItems ?? []) as PageGalleryItemValues[]}
              onChange={(galleryItems) =>
                onChange({
                  ...block,
                  source: { ...block.source, galleryItems },
                })
              }
            />
          ) : null}
        </>
      ) : null}

      {block.type === "formEmbed" ? (
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Form</span>
          <select
            value={block.source.formId ?? ""}
            onChange={(e) =>
              onChange({
                ...block,
                source: { ...block.source, formId: e.target.value || undefined },
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1.5"
          >
            <option value="">Select…</option>
            {formOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Only published forms render publicly.
          </p>
        </label>
      ) : null}

      {block.type === "articleList" || block.type === "featuredSlider" ? (
        <>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Mode</span>
            <select
              value={
                block.source.mode ??
                (block.type === "featuredSlider" ? "featured" : "latest")
              }
              onChange={(e) =>
                onChange({
                  ...block,
                  source: {
                    ...block.source,
                    mode: e.target.value as
                      | "latest"
                      | "featured"
                      | "category"
                      | "ids",
                  },
                })
              }
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            >
              <option value="latest">Latest</option>
              <option value="featured">Featured</option>
              <option value="category">By category</option>
              <option value="ids">Specific articles</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Limit</span>
            <input
              type="number"
              min={1}
              max={48}
              value={Number(
                block.settings.limit ??
                  (block.type === "featuredSlider" ? 3 : 6),
              )}
              onChange={(e) =>
                onChange({
                  ...block,
                  settings: {
                    ...block.settings,
                    limit: Number(e.target.value) || 6,
                  },
                })
              }
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={block.settings.showExcerpt !== false}
              onChange={(e) =>
                onChange({
                  ...block,
                  settings: {
                    ...block.settings,
                    showExcerpt: e.target.checked,
                  },
                })
              }
            />
            Show excerpts
          </label>
          {block.type === "articleList" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Variant</span>
                <select
                  value={String(block.settings.variant ?? "grid")}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      settings: { ...block.settings, variant: e.target.value },
                    })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                >
              <option value="grid">Grid</option>
              <option value="spotlight">Spotlight (1:3)</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={block.settings.showTitle === true}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      settings: {
                        ...block.settings,
                        showTitle: e.target.checked,
                      },
                    })
                  }
                />
                Show section title
              </label>
              {block.settings.showTitle === true ? (
                <>
                  <div className="flex gap-1">
                    {(["vi", "en"] as const).map((locale) => (
                      <button
                        key={locale}
                        type="button"
                        onClick={() => setLocaleTab(locale)}
                        className={`rounded px-2 py-1 text-xs ${
                          localeTab === locale
                            ? "bg-gray-900 text-white"
                            : "border border-gray-300 text-gray-700"
                        }`}
                      >
                        {locale.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs text-gray-500">
                      Section title ({localeTab.toUpperCase()})
                    </span>
                    <input
                      value={localeContent.text}
                      onChange={(e) =>
                        updateLocaleField(localeTab, "text", e.target.value)
                      }
                      placeholder={
                        localeTab === "vi" ? "Tiêu đề mục…" : "Section title…"
                      }
                      className="w-full rounded border border-gray-300 px-2 py-1.5"
                    />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          {(() => {
            const mode =
              block.source.mode ??
              (block.type === "featuredSlider" ? "featured" : "latest");
            if (mode === "category") {
              return (
                <MultiCheck
                  label="Categories"
                  options={categoryOptions}
                  values={block.source.categoryIds ?? []}
                  onChange={(categoryIds) =>
                    onChange({
                      ...block,
                      source: { ...block.source, categoryIds },
                    })
                  }
                />
              );
            }
            if (mode === "ids") {
              return (
                <MultiCheck
                  label="Articles"
                  options={articleOptions}
                  values={block.source.articleIds ?? []}
                  onChange={(articleIds) =>
                    onChange({
                      ...block,
                      source: { ...block.source, articleIds },
                    })
                  }
                />
              );
            }
            return null;
          })()}
        </>
      ) : null}

      {block.type === "articleCard" ? (
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Article</span>
          <select
            value={block.source.articleId ?? ""}
            onChange={(e) =>
              onChange({
                ...block,
                source: { ...block.source, articleId: e.target.value || undefined },
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1.5"
          >
            <option value="">Select…</option>
            {articleOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {block.type === "categoryList" ? (
        <MultiCheck
          label="Categories"
          options={categoryOptions}
          values={block.source.categoryIds ?? []}
          onChange={(categoryIds) =>
            onChange({
              ...block,
              source: { ...block.source, categoryIds },
            })
          }
        />
      ) : null}

      {block.type === "menu" ? (
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Location</span>
          <select
            value={block.source.menuLocation ?? "navigation"}
            onChange={(e) =>
              onChange({
                ...block,
                source: {
                  ...block.source,
                  menuLocation: e.target.value as "navigation" | "footer",
                },
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1.5"
          >
            <option value="navigation">Navigation</option>
            <option value="footer">Footer</option>
          </select>
        </label>
      ) : null}

      {block.type === "spacer" ? (
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Height (px)</span>
          <input
            type="number"
            min={8}
            max={400}
            value={Number(block.settings.height ?? 32)}
            onChange={(e) =>
              onChange({
                ...block,
                settings: {
                  ...block.settings,
                  height: Number(e.target.value) || 32,
                },
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1.5"
          />
        </label>
      ) : null}

      {block.type === "breadcrumb" ? (
        <p className="text-xs text-gray-500">
          Renders a Back to home link. Drag this block into any section.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onRemove}
        className="w-full rounded border border-red-300 px-2 py-1.5 text-red-700 hover:bg-red-50"
      >
        Remove block
      </button>
    </div>
  );
}

function MultiCheck({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const set = new Set(values);
  return (
    <div>
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
        {options.length === 0 ? (
          <p className="text-xs text-gray-400">No options</p>
        ) : (
          options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2 text-xs"
              style={{
                paddingLeft: `${Math.min(opt.depth ?? 0, 3) * 0.75}rem`,
              }}
            >
              <input
                type="checkbox"
                checked={set.has(opt.id)}
                onChange={(e) => {
                  const next = new Set(values);
                  if (e.target.checked) next.add(opt.id);
                  else next.delete(opt.id);
                  onChange([...next]);
                }}
              />
              <span className="truncate">
                {(opt.depth ?? 0) > 0 ? (
                  <span className="mr-1 text-gray-400" aria-hidden>
                    └
                  </span>
                ) : null}
                {opt.label.replace(/^(—\s*)+/, "") || opt.label}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
