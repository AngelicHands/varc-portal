"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { updateHomeLocationAction } from "@/lib/account-actions";
import { latLngToMaidenhead } from "@/lib/maidenhead";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import { buildHomeGridMarker, type HomeGridMarker } from "@/lib/qso-map";

type Props = {
  enabled: boolean;
  callsign: string;
  mapTheme: HamMapTheme;
  onLocationSaved: (marker: HomeGridMarker) => void;
};

export function HamMapHomeLocationPrompt({
  enabled,
  callsign,
  mapTheme,
  onLocationSaved,
}: Props) {
  const t = useTranslations("ham.map");
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();
  const light = mapTheme === "light";

  const open = enabled && !dismissed;

  function dismiss() {
    setDismissed(true);
    setError(null);
  }

  function onAllow() {
    setError(null);
    if (!navigator.geolocation) {
      setError(t("homeLocationUnsupported"));
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const grid = latLngToMaidenhead(lat, lng, 6);
        if (!grid) {
          setLocating(false);
          setError(t("homeLocationFailed"));
          return;
        }

        startTransition(async () => {
          const result = await updateHomeLocationAction({
            homeGrid: grid,
            homeLat: lat,
            homeLng: lng,
          });
          setLocating(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }

          const marker = buildHomeGridMarker(
            result.homeGrid,
            callsign,
            result.homeLat,
            result.homeLng,
          );
          if (marker) onLocationSaved(marker);
          setDismissed(true);
          router.refresh();
        });
      },
      () => {
        setLocating(false);
        setError(t("homeLocationFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const busy = locating || pending;

  const panelClass = light
    ? "border-zinc-300/80 bg-white/95 text-zinc-900 shadow-xl shadow-zinc-900/15"
    : "border-white/10 bg-zinc-950/95 text-white shadow-2xl shadow-black/50";
  const titleClass = light ? "text-zinc-900" : "text-white";
  const closeClass = light
    ? "text-zinc-500 hover:bg-zinc-100"
    : "text-white/60 hover:bg-white/10";
  const bodyClass = light ? "text-zinc-600" : "text-white/70";
  const declineClass = light
    ? "border-zinc-300 text-zinc-800 hover:bg-zinc-100"
    : "border-white/20 text-white hover:bg-white/10";
  const allowClass = light
    ? "bg-zinc-900 text-white hover:bg-zinc-800"
    : "bg-white text-zinc-950 hover:bg-white/90";
  const errorClass = light
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-red-400/30 bg-red-500/15 text-red-100";
  const overlayClass = light ? "bg-zinc-900/35" : "bg-black/60";

  return (
    <PortalDialog
      open={open}
      title={t("homeLocationPromptTitle")}
      onClose={dismiss}
      closeDisabled={busy}
      overlayClassName={overlayClass}
      zIndex={110}
      panelClassName={panelClass}
      titleClassName={titleClass}
      closeClassName={closeClass}
    >
      <p className={`text-sm ${bodyClass}`}>{t("homeLocationPromptBody")}</p>
      {error ? (
        <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${errorClass}`}>
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={dismiss}
          className={`rounded-md border px-4 py-2 text-sm transition disabled:opacity-50 ${declineClass}`}
        >
          {t("homeLocationPromptDecline")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onAllow}
          className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${allowClass}`}
        >
          {busy ? t("homeLocationPromptWorking") : t("homeLocationPromptAllow")}
        </button>
      </div>
    </PortalDialog>
  );
}
