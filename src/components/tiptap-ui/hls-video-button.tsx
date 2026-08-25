"use client";

import { useEffect, useId, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTiptapEditor } from "@/hooks/use-tiptap-editor";
import { Button } from "@/components/tiptap-ui-primitive/button";
import { VideoIcon } from "@/components/tiptap-icons/video-icon";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { isHlsPlaylistUrl } from "@/lib/hls-player";

type Props = {
  editor?: Editor | null;
  text?: string;
};

export function HlsVideoButton({
  editor: providedEditor,
  text = "HLS",
}: Props) {
  const { editor } = useTiptapEditor(providedEditor);
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [poster, setPoster] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const srcId = useId();
  const posterId = useId();
  const titleId = useId();

  const canInsert = Boolean(
    editor?.isEditable && editor.schema.nodes.hlsVideo,
  );

  useEffect(() => {
    if (!open) return;
    setSrc("");
    setPoster("");
    setTitle("");
    setError("");
  }, [open]);

  function insertVideo() {
    if (!editor) return;
    const playlist = src.trim();
    if (!isHlsPlaylistUrl(playlist)) {
      setError("Enter a valid http(s) .m3u8 playlist URL.");
      return;
    }

    const ok = editor
      .chain()
      .focus()
      .setHlsVideo({
        src: playlist,
        poster: poster.trim() || null,
        title: title.trim() || null,
      })
      .run();

    if (!ok) {
      setError("Could not insert the HLS video.");
      return;
    }
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        disabled={!canInsert}
        data-disabled={!canInsert}
        onClick={() => setOpen(true)}
        tooltip="Insert HLS (m3u8) video"
        aria-label="Insert HLS (m3u8) video"
      >
        <VideoIcon className="tiptap-button-icon" />
        {text ? <span className="tiptap-button-text">{text}</span> : null}
      </Button>

      <AdminDialog
        open={open}
        title="Insert HLS video"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor={srcId}
              className="block text-sm font-medium text-gray-700"
            >
              Playlist URL (.m3u8)
            </label>
            <input
              id={srcId}
              type="url"
              value={src}
              onChange={(event) => {
                setSrc(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertVideo();
                }
              }}
              placeholder="https://example.com/stream.m3u8"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor={titleId}
              className="block text-sm font-medium text-gray-700"
            >
              Caption (optional)
            </label>
            <input
              id={titleId}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Video caption"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div>
            <label
              htmlFor={posterId}
              className="block text-sm font-medium text-gray-700"
            >
              Poster image URL (optional)
            </label>
            <input
              id={posterId}
              type="url"
              value={poster}
              onChange={(event) => setPoster(event.target.value)}
              placeholder="https://example.com/poster.jpg"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={insertVideo}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Insert video
            </button>
          </div>
        </div>
      </AdminDialog>
    </>
  );
}
