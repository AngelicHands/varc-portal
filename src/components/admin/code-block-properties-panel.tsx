"use client";

import { useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import {
  CODE_BLOCK_LANGUAGES,
  CODE_BLOCK_THEMES,
  codeBlockLanguageLabel,
  normalizeCodeBlockTheme,
  type CodeBlockTheme,
} from "@/lib/code-block-options";
import type { PortalCodeBlockAttrs } from "@/components/tiptap-extension/code-block-extension";

type Props = {
  editor: Editor | null;
  /** Called when a code block becomes selected or deselected. */
  onActiveChange?: (active: boolean) => void;
};

type CodeBlockSelection = PortalCodeBlockAttrs & {
  pos: number;
};

function readCodeBlockSelection(editor: Editor | null): CodeBlockSelection | null {
  if (!editor || editor.isDestroyed || !editor.isEditable) return null;

  const { selection } = editor.state;

  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === "codeBlock"
  ) {
    const attrs = selection.node.attrs;
    return {
      pos: selection.from,
      language: attrs.language ? String(attrs.language) : null,
      theme: normalizeCodeBlockTheme(attrs.theme),
      showLanguageLabel: Boolean(attrs.showLanguageLabel),
      showLineNumbers: attrs.showLineNumbers !== false,
    };
  }

  const { $from } = selection;
  if ($from.parent.type.name !== "codeBlock") return null;

  const attrs = $from.parent.attrs;
  return {
    pos: $from.before(),
    language: attrs.language ? String(attrs.language) : null,
    theme: normalizeCodeBlockTheme(attrs.theme),
    showLanguageLabel: Boolean(attrs.showLanguageLabel),
    showLineNumbers: attrs.showLineNumbers !== false,
  };
}

function applyCodeBlockAttrs(
  editor: Editor,
  attrs: Partial<PortalCodeBlockAttrs>,
): void {
  const next = {
    ...attrs,
    ...(attrs.language !== undefined
      ? { language: attrs.language?.trim() || null }
      : {}),
    ...(attrs.theme !== undefined
      ? { theme: normalizeCodeBlockTheme(attrs.theme) }
      : {}),
  };

  editor.chain().focus().updateAttributes("codeBlock", next).run();
}

/**
 * Code block display options for the article Properties aside.
 */
export function CodeBlockPropertiesPanel({ editor, onActiveChange }: Props) {
  const selection = useEditorState({
    editor,
    selector: ({ editor: current }) => readCodeBlockSelection(current),
  });

  const active = Boolean(selection);

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const updateAttrs = useCallback(
    (attrs: Partial<PortalCodeBlockAttrs>) => {
      if (!editor) return;
      applyCodeBlockAttrs(editor, attrs);
    },
    [editor],
  );

  if (!active || !selection) return null;

  const languageValue = selection.language ?? "";

  return (
    <div className="grid min-w-0 content-start gap-3 rounded-md border border-gray-200 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-gray-900">Code block</p>
        <p className="mt-0.5 text-xs text-gray-500">
          Customize how the selected code block appears when published.
        </p>
      </div>

      <label className="block min-w-0 text-sm">
        <span className="mb-1 block font-medium text-gray-900">Language</span>
        <select
          value={languageValue}
          aria-label="Code block language"
          className="w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => {
            const value = event.target.value;
            updateAttrs({ language: value || null });
          }}
        >
          {CODE_BLOCK_LANGUAGES.map((option) => (
            <option key={option.value || "plain"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="min-w-0">
        <legend className="mb-2 block text-sm font-medium text-gray-900">
          Theme
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {CODE_BLOCK_THEMES.map((theme) => {
            const selected = selection.theme === theme.value;
            return (
              <button
                key={theme.value}
                type="button"
                aria-pressed={selected}
                className={`flex min-w-0 items-center gap-2 rounded border px-2.5 py-2 text-left text-sm transition ${
                  selected
                    ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
                onClick={() => updateAttrs({ theme: theme.value as CodeBlockTheme })}
              >
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded border border-black/10"
                  style={{ backgroundColor: theme.swatch }}
                />
                <span className="truncate text-gray-900">{theme.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-gray-200 px-3 py-3 text-sm">
        <AdminCheckbox
          className="mt-0.5"
          checked={selection.showLanguageLabel}
          onChange={(event) =>
            updateAttrs({ showLanguageLabel: event.target.checked })
          }
        />
        <span className="min-w-0">
          <span className="block font-medium text-gray-900">
            Display language label
          </span>
          <span className="mt-0.5 block text-xs text-gray-500">
            Show a header above the block
            {languageValue
              ? ` (${codeBlockLanguageLabel(languageValue)})`
              : " when a language is selected"}
            .
          </span>
        </span>
      </label>

      <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-gray-200 px-3 py-3 text-sm">
        <AdminCheckbox
          className="mt-0.5"
          checked={selection.showLineNumbers}
          onChange={(event) =>
            updateAttrs({ showLineNumbers: event.target.checked })
          }
        />
        <span className="min-w-0">
          <span className="block font-medium text-gray-900">Show line numbers</span>
          <span className="mt-0.5 block text-xs text-gray-500">
            Render a gutter with line numbers on the published article.
          </span>
        </span>
      </label>
    </div>
  );
}
