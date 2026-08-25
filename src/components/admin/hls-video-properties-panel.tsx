"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { isHlsPlaylistUrl } from "@/lib/hls-player";

type Props = {
  editor: Editor | null;
  /** Called when an HLS block becomes selected or deselected. */
  onActiveChange?: (active: boolean) => void;
};

type Draft = {
  src: string;
  title: string;
  poster: string;
};

type HlsSelection = {
  pos: number;
  src: string;
  title: string;
  poster: string;
};

function readHlsSelection(editor: Editor | null): HlsSelection | null {
  if (!editor || editor.isDestroyed || !editor.isEditable) return null;
  const { selection } = editor.state;
  if (
    !(selection instanceof NodeSelection) ||
    selection.node.type.name !== "hlsVideo"
  ) {
    return null;
  }
  const attrs = selection.node.attrs;
  return {
    pos: selection.from,
    src: String(attrs.src ?? ""),
    title: String(attrs.title ?? ""),
    poster: String(attrs.poster ?? ""),
  };
}

function readHlsAtPos(
  editor: Editor | null,
  pos: number | null,
): HlsSelection | null {
  if (!editor || editor.isDestroyed || pos == null) return null;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "hlsVideo") return null;
  return {
    pos,
    src: String(node.attrs.src ?? ""),
    title: String(node.attrs.title ?? ""),
    poster: String(node.attrs.poster ?? ""),
  };
}

function applyHlsAttrs(
  editor: Editor,
  pos: number,
  attrs: Partial<Draft>,
): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "hlsVideo") return false;

  const next = {
    ...node.attrs,
    ...attrs,
    src: attrs.src !== undefined ? attrs.src.trim() : node.attrs.src,
    title:
      attrs.title !== undefined
        ? attrs.title.trim() || null
        : node.attrs.title,
    poster:
      attrs.poster !== undefined
        ? attrs.poster.trim() || null
        : node.attrs.poster,
  };

  if (
    (node.attrs.src ?? "") === (next.src ?? "") &&
    (node.attrs.title ?? "") === (next.title ?? "") &&
    (node.attrs.poster ?? "") === (next.poster ?? "")
  ) {
    return true;
  }

  const tr = editor.state.tr.setNodeMarkup(pos, undefined, next);
  editor.view.dispatch(tr);
  return true;
}

/**
 * Inline HLS video fields for the article Properties aside (not a popup).
 */
export function HlsVideoPropertiesPanel({ editor, onActiveChange }: Props) {
  const selection = useEditorState({
    editor,
    selector: ({ editor: current }) => readHlsSelection(current),
  });

  const [editing, setEditing] = useState(false);
  const [editPos, setEditPos] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({
    src: "",
    title: "",
    poster: "",
  });
  const [srcError, setSrcError] = useState("");

  const activeSelection =
    selection ?? (editing ? readHlsAtPos(editor, editPos) : null);
  const active = Boolean(activeSelection);
  const values = editing && activeSelection ? draft : {
    src: activeSelection?.src ?? "",
    title: activeSelection?.title ?? "",
    poster: activeSelection?.poster ?? "",
  };

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const beginEdit = useCallback((current: HlsSelection) => {
    setEditing(true);
    setEditPos(current.pos);
    setDraft({
      src: current.src,
      title: current.title,
      poster: current.poster,
    });
    setSrcError("");
  }, []);

  const endEdit = useCallback(() => {
    setEditing(false);
    setEditPos(null);
  }, []);

  const commitField = useCallback(
    (pos: number, field: keyof Draft, value: string) => {
      if (!editor) return false;

      if (field === "src") {
        const trimmed = value.trim();
        if (trimmed && !isHlsPlaylistUrl(trimmed)) {
          setSrcError("URL must be an http(s) .m3u8 playlist.");
          return false;
        }
        setSrcError("");
        if (!trimmed) {
          setSrcError("Playlist URL is required.");
          return false;
        }
      }

      return applyHlsAttrs(editor, pos, { [field]: value });
    },
    [editor],
  );

  if (!active || !activeSelection) return null;

  return (
    <div className="grid min-w-0 content-start gap-3 rounded-md border border-gray-200 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-gray-900">HLS video</p>
        <p className="mt-0.5 text-xs text-gray-500">
          Edit the selected video block. Deselect it to hide these fields.
        </p>
      </div>

      <label className="block min-w-0 text-sm">
        <span className="mb-1 block font-medium text-gray-900">
          Playlist URL (.m3u8)
        </span>
        <input
          type="url"
          value={values.src}
          placeholder="https://example.com/stream.m3u8"
          aria-label="HLS playlist URL"
          className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 text-sm"
          onFocus={() => beginEdit(activeSelection)}
          onChange={(event) => {
            setDraft((prev) => ({ ...prev, src: event.target.value }));
            setSrcError("");
          }}
          onBlur={() => {
            commitField(activeSelection.pos, "src", values.src);
            endEdit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
              editor?.chain().focus().setNodeSelection(activeSelection.pos).run();
            }
          }}
        />
        {srcError ? (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {srcError}
          </p>
        ) : null}
      </label>

      <label className="block min-w-0 text-sm">
        <span className="mb-1 block font-medium text-gray-900">Caption</span>
        <input
          type="text"
          value={values.title}
          maxLength={500}
          placeholder="Optional caption under the video"
          aria-label="HLS video caption"
          className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 text-sm"
          onFocus={() => beginEdit(activeSelection)}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((prev) => ({ ...prev, title: value }));
            commitField(activeSelection.pos, "title", value);
          }}
          onBlur={() => {
            commitField(activeSelection.pos, "title", values.title);
            endEdit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
              editor?.chain().focus().setNodeSelection(activeSelection.pos).run();
            }
          }}
        />
      </label>

      <label className="block min-w-0 text-sm">
        <span className="mb-1 block font-medium text-gray-900">
          Poster image URL
        </span>
        <input
          type="url"
          value={values.poster}
          placeholder="https://example.com/poster.jpg"
          aria-label="HLS video poster URL"
          className="w-full min-w-0 rounded border border-gray-300 px-3 py-2 text-sm"
          onFocus={() => beginEdit(activeSelection)}
          onChange={(event) => {
            setDraft((prev) => ({ ...prev, poster: event.target.value }));
          }}
          onBlur={() => {
            commitField(activeSelection.pos, "poster", values.poster);
            endEdit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
              editor?.chain().focus().setNodeSelection(activeSelection.pos).run();
            }
          }}
        />
      </label>
    </div>
  );
}
