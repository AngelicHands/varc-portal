"use client";

import { useEffect, type RefObject } from "react";
import { enhanceCodeBlocksInRoot } from "@/lib/enhance-code-blocks";

/**
 * Enhance published code blocks with theme shell, language header, and line numbers.
 */
export function useEnhanceCodeBlocks(
  rootRef: RefObject<HTMLElement | null>,
  html: string,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    enhanceCodeBlocksInRoot(root);
  }, [rootRef, html]);
}
