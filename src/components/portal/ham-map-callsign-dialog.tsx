"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { updateProfileAction } from "@/lib/account-actions";
import { hamPublicPath } from "@/lib/ham-reserved";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import {
  isValidCallsign,
  normalizeProfileCallsign,
} from "@/lib/validations/qso";

type Props = {
  open: boolean;
  mapTheme: HamMapTheme;
  onClose: () => void;
};

/**
 * Lets an owner claim a callsign without leaving the map. Mount it only while
 * open — the draft and error state then reset on their own between openings.
 */
export function HamMapCallsignDialog({ open, mapTheme, onClose }: Props) {
  const t = useTranslations("ham.map");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const light = mapTheme === "light";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = normalizeProfileCallsign(value);
    if (!isValidCallsign(next)) {
      setError(t("callsignPromptInvalid"));
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateProfileAction({ callsign: next });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The owner's map moves from /account to /{callsign} once a callsign exists.
      router.replace(`${hamPublicPath(next)}?view=map`);
      router.refresh();
    });
  }

  const panelClass = light
    ? "border-zinc-300/80 bg-white/95 text-zinc-900 shadow-xl shadow-zinc-900/15"
    : "border-white/10 bg-zinc-950/95 text-white shadow-2xl shadow-black/50";
  const titleClass = light ? "text-zinc-900" : "text-white";
  const closeClass = light
    ? "text-zinc-500 hover:bg-zinc-100"
    : "text-white/60 hover:bg-white/10";
  const bodyClass = light ? "text-zinc-600" : "text-white/70";
  const labelClass = light ? "text-zinc-500" : "text-white/55";
  const inputClass = light
    ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
    : "border-white/15 bg-white/5 text-white placeholder:text-white/35";
  const cancelClass = light
    ? "border-zinc-300 text-zinc-800 hover:bg-zinc-100"
    : "border-white/20 text-white hover:bg-white/10";
  const saveClass = light
    ? "bg-zinc-900 text-white hover:bg-zinc-800"
    : "bg-white text-zinc-950 hover:bg-white/90";
  const errorClass = light
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-red-400/30 bg-red-500/15 text-red-100";
  const overlayClass = light ? "bg-zinc-900/35" : "bg-black/60";

  return (
    <PortalDialog
      open={open}
      title={t("callsignPromptTitle")}
      onClose={onClose}
      closeDisabled={pending}
      overlayClassName={overlayClass}
      zIndex={120}
      panelClassName={panelClass}
      titleClassName={titleClass}
      closeClassName={closeClass}
    >
      <form onSubmit={onSubmit}>
        <p className={`text-sm ${bodyClass}`}>{t("callsignPromptBody")}</p>

        <label className="mt-4 block text-sm">
          <span
            className={`text-xs font-medium tracking-wide uppercase ${labelClass}`}
          >
            {t("callsignPromptLabel")}
          </span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value.toUpperCase())}
            autoFocus
            maxLength={15}
            placeholder="XV1ABC"
            disabled={pending}
            className={`mt-2 w-full rounded-md border px-3 py-2 uppercase outline-none disabled:opacity-50 ${inputClass}`}
          />
        </label>

        {error ? (
          <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${errorClass}`}>
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className={`rounded-md border px-4 py-2 text-sm transition disabled:opacity-50 ${cancelClass}`}
          >
            {t("callsignPromptCancel")}
          </button>
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${saveClass}`}
          >
            {pending ? t("callsignPromptWorking") : t("callsignPromptSave")}
          </button>
        </div>
      </form>
    </PortalDialog>
  );
}
