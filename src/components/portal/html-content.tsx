"use client";

import { useMemo, useRef } from "react";
import {
  normalizeEditorHtml,
  sanitizeHtml,
} from "@/lib/html";
import { useAttachHlsVideos } from "@/hooks/use-attach-hls-videos";
import { useEnhanceCodeBlocks } from "@/hooks/use-enhance-code-blocks";
import "@/styles/portal-code-block.scss";

export function HtmlContent({
  html,
  className = "prose-article-wide mt-10",
}: {
  html: string;
  className?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const safe = useMemo(
    () => sanitizeHtml(normalizeEditorHtml(html)),
    [html],
  );
  useAttachHlsVideos(contentRef, safe);
  useEnhanceCodeBlocks(contentRef, safe);

  return (
    <div
      ref={contentRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
