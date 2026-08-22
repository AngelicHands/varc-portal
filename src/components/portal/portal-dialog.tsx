"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Fullscreen API only paints descendants of the fullscreen node; body portals sit behind it. */
function dialogPortalRoot(): HTMLElement {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  const fullscreen =
    document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  if (fullscreen instanceof HTMLElement) return fullscreen;
  return document.body;
}

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
  closeDisabled?: boolean;
  /** Extra classes on the fullscreen backdrop (e.g. backdrop tint). */
  overlayClassName?: string;
  /** Stacking order within the portal root; default 50. Map dialogs use 110+. */
  zIndex?: number;
  /** Override dialog panel surface (defaults to site surface). */
  panelClassName?: string;
  titleClassName?: string;
  closeClassName?: string;
};

export function PortalDialog({
  open,
  title,
  onClose,
  children,
  size = "md",
  closeDisabled = false,
  overlayClassName = "",
  zIndex = 50,
  panelClassName = "border-border bg-surface",
  titleClassName = "text-foreground",
  closeClassName = "text-muted hover:bg-foreground/5",
}: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const syncRoot = () => setContainer(dialogPortalRoot());
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
      syncRoot();
    });
    document.addEventListener("fullscreenchange", syncRoot);
    document.addEventListener("webkitfullscreenchange", syncRoot);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", syncRoot);
      document.removeEventListener("webkitfullscreenchange", syncRoot);
    };
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, mounted, closeDisabled, onClose]);

  if (!mounted || !open || !container) return null;

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/40 p-4 ${overlayClassName}`}
      style={{ zIndex }}
      role="presentation"
      onClick={closeDisabled ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[90dvh] w-full overflow-y-auto rounded-xl border p-6 shadow-xl backdrop-blur-md ${panelClassName} ${
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className={`text-xl font-medium ${titleClassName}`}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className={`rounded px-2 py-1 text-lg leading-none disabled:opacity-50 ${closeClassName}`}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    container,
  );
}
