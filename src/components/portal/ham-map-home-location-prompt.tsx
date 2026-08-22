"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { updateHomeLocationAction } from "@/lib/account-actions";
import { formatMaidenheadDisplay, latLngToMaidenhead } from "@/lib/maidenhead";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import { persistHamMapLocation } from "@/lib/map/ham-map-location";
import { buildHomeGridMarker, type HomeGridMarker } from "@/lib/qso-map";

export type HamMapLocationPromptIntent = "guest" | "locate" | "update";

type Props = {
  enabled: boolean;
  intent: HamMapLocationPromptIntent;
  callsign: string;
  mapTheme: HamMapTheme;
  updateGrid?: string;
  updateLat?: number;
  updateLng?: number;
  onLocationSaved: (marker: HomeGridMarker) => void;
  onLocated?: (grid: string, lat: number, lng: number) => void;
  onSkipUpdate?: () => void;
  onOpenChange?: (open: boolean) => void;
  onLocationAcquireStart?: () => void;
  onLocationAcquireEnd?: () => void;
};

export function HamMapHomeLocationPrompt({
  enabled,
  intent,
  callsign,
  mapTheme,
  updateGrid = "",
  updateLat,
  updateLng,
  onLocationSaved,
  onLocated,
  onSkipUpdate,
  onOpenChange,
  onLocationAcquireStart,
  onLocationAcquireEnd,
}: Props) {
  const t = useTranslations("ham.map");
  const router = useRouter();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();
  const light = mapTheme === "light";
  const promptKey = `${intent}:${updateGrid}`;

  const open = enabled && dismissedKey !== promptKey;

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  function dismiss() {
    if (intent === "update") onSkipUpdate?.();
    setDismissedKey(promptKey);
    setError(null);
  }

  function persistAndShow(grid: string, lat: number, lng: number) {
    persistHamMapLocation(grid, lat, lng);
    onLocated?.(grid, lat, lng);
  }

  function saveToProfile(grid: string, lat: number, lng: number) {
    onLocationAcquireStart?.();
    startTransition(async () => {
      const result = await updateHomeLocationAction({
        homeGrid: grid,
        homeLat: lat,
        homeLng: lng,
      });
      setLocating(false);
      onLocationAcquireEnd?.();
      if (!result.ok) {
        setError(result.error);
        return;
      }

      persistHamMapLocation(result.homeGrid, result.homeLat, result.homeLng);
      onLocated?.(result.homeGrid, result.homeLat, result.homeLng);
      const marker = buildHomeGridMarker(
        result.homeGrid,
        callsign,
        result.homeLat,
        result.homeLng,
      );
      if (marker) onLocationSaved(marker);
      setDismissedKey(promptKey);
      router.refresh();
    });
  }

  function onAllow() {
    setError(null);

    if (intent === "update") {
      if (
        !updateGrid ||
        typeof updateLat !== "number" ||
        typeof updateLng !== "number"
      ) {
        setError(t("homeLocationFailed"));
        return;
      }
      saveToProfile(updateGrid, updateLat, updateLng);
      return;
    }

    if (!navigator.geolocation) {
      setError(t("homeLocationUnsupported"));
      return;
    }

    setLocating(true);
    onLocationAcquireStart?.();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const grid = latLngToMaidenhead(lat, lng, 6);
        if (!grid) {
          setLocating(false);
          onLocationAcquireEnd?.();
          setError(t("homeLocationFailed"));
          return;
        }

        persistAndShow(grid, lat, lng);
        setLocating(false);
        onLocationAcquireEnd?.();
        setDismissedKey(promptKey);
      },
      () => {
        setLocating(false);
        onLocationAcquireEnd?.();
        setError(t("homeLocationFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const busy = locating || pending;
  const title =
    intent === "update"
      ? t("homeLocationPromptTitleUpdate")
      : intent === "guest"
        ? t("homeLocationPromptTitle")
        : t("homeLocationPromptTitleLocate");
  const body =
    intent === "update"
      ? t("homeLocationPromptBodyUpdate", {
          grid: formatMaidenheadDisplay(updateGrid),
        })
      : intent === "guest"
        ? t("homeLocationPromptBodyGuest")
        : t("homeLocationPromptBodyLocate");
  const allowLabel = busy
    ? intent === "update"
      ? t("homeLocationPromptSaving")
      : t("homeLocationPromptWorking")
    : intent === "update"
      ? t("homeLocationPromptAllowUpdate")
      : intent === "guest"
        ? t("homeLocationPromptAllowGuest")
        : t("homeLocationPromptAllowLocate");

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
      animated
      title={title}
      onClose={dismiss}
      closeDisabled={busy}
      overlayClassName={overlayClass}
      zIndex={110}
      panelClassName={panelClass}
      titleClassName={titleClass}
      closeClassName={closeClass}
    >
      <p className={`text-sm ${bodyClass}`}>{body}</p>
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
          {allowLabel}
        </button>
      </div>
    </PortalDialog>
  );
}
