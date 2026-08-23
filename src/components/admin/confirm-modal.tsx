"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

export type ConfirmModalProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  theme?: "admin" | "portal";
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  open,
  title = "Are you sure?",
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "danger",
  theme = "admin",
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const resolvedConfirmLabel =
    confirmLabel ?? (variant === "danger" ? "Delete" : "Confirm");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, pending, onCancel]);

  if (!open || !mounted) return null;

  const panelClass =
    theme === "portal"
      ? "w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
      : "w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl";
  const titleClass =
    theme === "portal"
      ? "text-center text-lg font-semibold text-foreground"
      : "text-center text-lg font-semibold text-gray-900";
  const messageClass =
    theme === "portal"
      ? "mt-2 text-center text-sm text-muted"
      : "mt-2 text-center text-sm text-gray-600";
  const cancelClass =
    theme === "portal"
      ? "cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
      : "cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";
  const confirmClass =
    variant === "danger"
      ? theme === "portal"
        ? "cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        : "cursor-pointer rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      : theme === "portal"
        ? "cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        : "cursor-pointer rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={pending ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={panelClass}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className={titleClass}>
          {title}
        </h2>
        <p className={messageClass}>{message}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className={cancelClass}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={confirmClass}
          >
            {pending ? "Please wait…" : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
