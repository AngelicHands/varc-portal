"use client";

import { useEffect, useRef, useState } from "react";
import {
  normalizeCoverFocus,
  type CoverFocusRect,
} from "@/lib/cover-focus";

type Props = {
  src: string;
  focus: CoverFocusRect | string;
  alt?: string;
  className?: string;
  /** fill = zoom until the rect covers the frame (hero). fit = keep whole rect visible. */
  mode?: "fill" | "fit";
  /** When false, skip ResizeObserver work (hidden / off-screen slides). */
  active?: boolean;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
};

type Layout = {
  width: number;
  height: number;
  left: number;
  top: number;
};

function layoutsClose(a: Layout, b: Layout) {
  return (
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5
  );
}

/**
 * Renders a cover image so the selected focus rectangle is centered in the
 * frame and scaled to fill (or fit) that frame — not CSS object-position alone,
 * which only aligns matching percentages and does not center an arbitrary region.
 */
export function FocusedCoverImage({
  src,
  focus,
  alt = "",
  className = "",
  mode = "fill",
  active = true,
  loading = "lazy",
  fetchPriority = "auto",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const rect = normalizeCoverFocus(focus);

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    let frame = 0;
    let disposed = false;
    let lastCw = 0;
    let lastCh = 0;

    const compute = () => {
      if (disposed) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!cw || !ch || !iw || !ih) return;

      // Ignore sub-pixel / mobile-chrome jitter (common while scrolling).
      if (Math.abs(cw - lastCw) < 1 && Math.abs(ch - lastCh) < 1 && layoutRef.current) {
        return;
      }
      lastCw = cw;
      lastCh = ch;

      const regionW = iw * (rect.width / 100);
      const regionH = ih * (rect.height / 100);
      if (regionW <= 0 || regionH <= 0) return;

      const scale =
        mode === "fit"
          ? Math.min(cw / regionW, ch / regionH)
          : Math.max(cw / regionW, ch / regionH);

      const displayW = iw * scale;
      const displayH = ih * scale;
      const cx = (rect.x + rect.width / 2) / 100;
      const cy = (rect.y + rect.height / 2) / 100;

      const next: Layout = {
        width: displayW,
        height: displayH,
        left: cw / 2 - cx * displayW,
        top: ch / 2 - cy * displayH,
      };

      if (layoutRef.current && layoutsClose(layoutRef.current, next)) return;
      layoutRef.current = next;
      setLayout(next);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(container);

    img.addEventListener("load", schedule);
    if (img.complete) schedule();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      img.removeEventListener("load", schedule);
    };
  }, [src, mode, active, rect.x, rect.y, rect.width, rect.height]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ contain: "paint" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        className="absolute max-w-none"
        style={
          layout
            ? {
                width: layout.width,
                height: layout.height,
                left: layout.left,
                top: layout.top,
              }
            : {
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "50% 50%",
              }
        }
      />
    </div>
  );
}
