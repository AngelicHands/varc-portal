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

const DIALOG_TRANSITION_MS = 300;

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
  /** Ease-in-out fade/slide enter and exit (map view dialogs). */
  animated?: boolean;
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
  animated = false,
}: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(false);

  if (animated && open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLeaving(false);
      setShown(false);
    } else {
      setLeaving(true);
      setShown(false);
    }
  }

  const visible = animated ? open || leaving : open;

  useEffect(() => {
    if (!animated || !open) return;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setShown(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [animated, open]);

  useEffect(() => {
    if (!animated || open || !leaving) return;
    const timer = window.setTimeout(
      () => setLeaving(false),
      DIALOG_TRANSITION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [animated, open, leaving]);

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
    if (!visible || !mounted) return;
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
  }, [visible, mounted, closeDisabled, onClose]);

  if (!mounted || !visible || !container) return null;

  const motionClass = animated
    ? "duration-300 ease-in-out motion-reduce:transition-none"
    : "";
  const overlayMotionClass = animated
    ? `transition-opacity ${motionClass} ${shown ? "opacity-100" : "opacity-0"}`
    : "";
  const panelMotionClass = animated
    ? `transition-[opacity,translate] ${motionClass} ${
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`
    : "";

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/40 p-4 ${overlayClassName} ${overlayMotionClass}`}
      style={{ zIndex }}
      role="presentation"
      onClick={closeDisabled ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[90dvh] w-full overflow-y-auto rounded-xl border p-6 shadow-xl backdrop-blur-md ${panelClassName} ${panelMotionClass} ${
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
