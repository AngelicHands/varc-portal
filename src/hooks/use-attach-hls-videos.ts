"use client";

import { useEffect, type RefObject } from "react";
import { attachHlsVideosInRoot } from "@/lib/hls-player";

/**
 * Hydrate HLS (m3u8) <video data-hls-src> elements under a content root.
 * Re-runs when `html` changes (e.g. after sanitize + dangerouslySetInnerHTML).
 */
export function useAttachHlsVideos(
  rootRef: RefObject<HTMLElement | null>,
  html: string,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return attachHlsVideosInRoot(root);
  }, [rootRef, html]);
}
