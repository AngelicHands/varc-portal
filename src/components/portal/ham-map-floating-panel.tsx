"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { hamPublicPath } from "@/lib/ham-reserved";
import { formatMaidenheadDisplay, latLngToMaidenhead } from "@/lib/maidenhead";
import { persistHamMapLocation } from "@/lib/map/ham-map-location";
import type { HamMapTheme } from "@/lib/map/maptiler-style";

export type HamMapViewer = {
  name: string;
  callsign: string;
  homeGrid: string;
  image?: string | null;
};

type Props = {
  viewer: HamMapViewer | null;
  branding: { siteName: string; logoUrl?: string };
  mapTheme: HamMapTheme;
  themeReady?: boolean;
  onMapThemeChange: (theme: HamMapTheme) => void;
  showLogbookPrivateNotice: boolean;
  mapAvailable?: boolean;
  offsetLeft?: number;
  showCallsignLookup?: boolean;
  lookupValue?: string;
  onLookupValueChange?: (value: string) => void;
  onLookupSubmit?: () => void;
  lookupPending?: boolean;
  lookupError?: string | null;
  onLoginClick?: () => void;
  onFocusGrid?: (grid: string) => void;
  guestGrid?: string;
  onGuestGrid?: (grid: string, lat?: number, lng?: number) => void;
  onLocationAcquireStart?: () => void;
  onLocationAcquireEnd?: () => void;
};

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z" />
    </svg>
  );
}

function ThemeToggle({
  light,
  mapAvailable,
  mapTheme,
  themeReady,
  themeActive,
  themeIdle,
  themeLabel,
  themeLight,
  themeDark,
  onMapThemeChange,
}: {
  light: boolean;
  mapAvailable: boolean;
  mapTheme: HamMapTheme;
  themeReady: boolean;
  themeActive: string;
  themeIdle: string;
  themeLabel: string;
  themeLight: string;
  themeDark: string;
  onMapThemeChange: (theme: HamMapTheme) => void;
}) {
  return (
    <div
      className={`inline-flex shrink-0 overflow-hidden rounded-md border ${light ? "border-zinc-300" : "border-white/15"}`}
      role="group"
      aria-label={themeLabel}
    >
      <button
        type="button"
        disabled={!mapAvailable}
        onClick={() => onMapThemeChange("light")}
        className={`inline-flex h-7 w-7 items-center justify-center disabled:opacity-40 ${themeReady && mapTheme === "light" ? themeActive : themeIdle}`}
        aria-label={themeLight}
        aria-pressed={themeReady && mapTheme === "light"}
      >
        <SunIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={!mapAvailable}
        onClick={() => onMapThemeChange("dark")}
        className={`inline-flex h-7 w-7 items-center justify-center disabled:opacity-40 ${themeReady && mapTheme === "dark" ? themeActive : themeIdle}`}
        aria-label={themeDark}
        aria-pressed={themeReady && mapTheme === "dark"}
      >
        <MoonIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function GuestAvatarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19c1.4-3.2 3.5-4.75 6.5-4.75S17.1 15.8 18.5 19" />
    </svg>
  );
}

export function HamMapFloatingPanel({
  viewer,
  branding,
  mapTheme,
  themeReady = true,
  onMapThemeChange,
  showLogbookPrivateNotice,
  mapAvailable = true,
  offsetLeft = 0,
  showCallsignLookup = true,
  lookupValue = "",
  onLookupValueChange,
  onLookupSubmit,
  lookupPending = false,
  lookupError = null,
  onLoginClick,
  onFocusGrid,
  guestGrid = "",
  onGuestGrid,
  onLocationAcquireStart,
  onLocationAcquireEnd,
}: Props) {
  const t = useTranslations("ham.map");
  const locale = useLocale();
  const light = mapTheme === "light";
  const loggedIn = Boolean(viewer);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const panelClass = light
    ? "border-zinc-300/80 bg-white/90 text-zinc-900 shadow-xl shadow-zinc-900/10"
    : "border-white/10 bg-black/75 text-white shadow-2xl shadow-black/40";
  const muted = light ? "text-zinc-500" : "text-white/60";
  const strong = light ? "text-zinc-900" : "text-white";
  const themeIdle = light
    ? "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    : "text-white/55 hover:bg-white/10 hover:text-white";
  const themeActive = light
    ? "bg-zinc-200 text-zinc-900"
    : "bg-white/15 text-white";
  const notice = light
    ? "border-amber-300/70 bg-amber-50 text-amber-950"
    : "border-amber-400/30 bg-amber-500/10 text-amber-100";
  const fieldClass = light
    ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
    : "border-white/15 bg-white/5 text-white placeholder:text-white/35";
  const buttonClass = light
    ? "border-zinc-300 text-zinc-800 hover:bg-zinc-100"
    : "border-white/20 text-white hover:bg-white/10";

  const displayName = viewer?.name.trim() || (loggedIn ? "—" : t("guestName"));
  const displayCallsign = viewer?.callsign.trim() || "—";
  const displayGrid = loggedIn
    ? guestGrid || viewer?.homeGrid.trim()
    : guestGrid;
  const profileHref = loggedIn
    ? viewer?.callsign.trim()
      ? hamPublicPath(viewer.callsign)
      : `/${locale}/account`
    : null;
  const busy = locating;

  function requestLocation() {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError(t("homeLocationUnsupported"));
      return;
    }
    setLocating(true);
    onLocationAcquireStart?.();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const grid = latLngToMaidenhead(
          position.coords.latitude,
          position.coords.longitude,
          6,
        );
        if (!grid) {
          setLocating(false);
          onLocationAcquireEnd?.();
          setLocationError(t("homeLocationFailed"));
          return;
        }
        persistHamMapLocation(
          grid,
          position.coords.latitude,
          position.coords.longitude,
        );
        onGuestGrid?.(
          grid,
          position.coords.latitude,
          position.coords.longitude,
        );
        setLocating(false);
        onLocationAcquireEnd?.();
      },
      () => {
        setLocating(false);
        onLocationAcquireEnd?.();
        setLocationError(t("homeLocationFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <aside
      id="ham-map-tour-welcome"
      className="pointer-events-auto absolute top-3 z-20 flex w-[min(100%-1.5rem,22rem)] flex-col gap-2 transition-[left] duration-300 ease-in-out motion-reduce:transition-none"
      style={{ left: 12 + offsetLeft }}
    >
      <div
        className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 backdrop-blur-md ${panelClass}`}
      >
        <NextLink
          href="/"
          className="shrink-0"
          aria-label={branding.siteName}
          title={branding.siteName}
        >
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt=""
              className="h-10 w-10 rounded-md object-contain"
            />
          ) : (
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-md text-xs font-semibold ${light ? "bg-zinc-100" : "bg-white/10"}`}
            >
              {branding.siteName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </NextLink>

        <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {profileHref ? (
            <NextLink
              href={profileHref}
              className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${light ? "bg-zinc-100" : "bg-white/10"}`}
              aria-hidden
            >
              {viewer?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewer.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className={`text-xs font-semibold ${muted}`}>
                  {(displayName !== "—" ? displayName : displayCallsign)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
              )}
            </NextLink>
          ) : (
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${light ? "bg-zinc-100" : "bg-white/10"}`}
              aria-hidden
            >
              <GuestAvatarIcon className={`h-5 w-5 ${muted}`} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            {loggedIn ? (
              <>
                <div className="flex items-center gap-2">
                  {profileHref ? (
                    <NextLink
                      href={profileHref}
                      className={`min-w-0 flex-1 truncate text-sm font-medium hover:underline ${strong}`}
                    >
                      {displayName}
                    </NextLink>
                  ) : (
                    <p className={`min-w-0 flex-1 truncate text-sm font-medium ${strong}`}>
                      {displayName}
                    </p>
                  )}
                  <ThemeToggle
                    light={light}
                    mapAvailable={mapAvailable}
                    mapTheme={mapTheme}
                    themeReady={themeReady}
                    themeActive={themeActive}
                    themeIdle={themeIdle}
                    themeLabel={t("themeLabel")}
                    themeLight={t("themeLight")}
                    themeDark={t("themeDark")}
                    onMapThemeChange={onMapThemeChange}
                  />
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  {profileHref ? (
                    <NextLink
                      href={profileHref}
                      className={`min-w-0 flex-1 truncate font-display text-base tracking-wide hover:underline ${strong}`}
                    >
                      {displayCallsign}
                    </NextLink>
                  ) : (
                    <p
                      className={`min-w-0 flex-1 truncate font-display text-base tracking-wide ${strong}`}
                    >
                      {displayCallsign}
                    </p>
                  )}
                  {displayGrid ? (
                    <button
                      type="button"
                      onClick={() => onFocusGrid?.(displayGrid)}
                      title={t("focusHomeGrid")}
                      className={`shrink-0 text-right text-xs font-medium hover:underline ${strong}`}
                    >
                      {formatMaidenheadDisplay(displayGrid)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={requestLocation}
                      className={`shrink-0 text-right text-[11px] font-medium underline-offset-2 hover:underline disabled:opacity-50 ${muted}`}
                    >
                      {busy ? t("homeLocationPromptWorking") : t("requestLocation")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onLoginClick}
                    className={`min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-sm font-medium transition ${buttonClass}`}
                  >
                    {t("lookupSignIn")}
                  </button>
                  <ThemeToggle
                    light={light}
                    mapAvailable={mapAvailable}
                    mapTheme={mapTheme}
                    themeReady={themeReady}
                    themeActive={themeActive}
                    themeIdle={themeIdle}
                    themeLabel={t("themeLabel")}
                    themeLight={t("themeLight")}
                    themeDark={t("themeDark")}
                    onMapThemeChange={onMapThemeChange}
                  />
                </div>
                <div className="mt-0.5 flex items-center justify-end">
                  {displayGrid ? (
                    <button
                      type="button"
                      onClick={() => onFocusGrid?.(displayGrid)}
                      title={t("focusHomeGrid")}
                      className={`text-right text-xs font-medium hover:underline ${strong}`}
                    >
                      {formatMaidenheadDisplay(displayGrid)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={requestLocation}
                      className={`text-right text-[11px] font-medium underline-offset-2 hover:underline disabled:opacity-50 ${muted}`}
                    >
                      {busy ? t("homeLocationPromptWorking") : t("requestLocation")}
                    </button>
                  )}
                </div>
              </>
            )}
            {locationError ? (
              <p className={`mt-1 text-[11px] ${light ? "text-red-700" : "text-red-200"}`}>
                {locationError}
              </p>
            ) : null}
          </div>
        </div>

          {showCallsignLookup ? (
            <form
              className="mt-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                onLookupSubmit?.();
              }}
            >
              <label
                htmlFor="ham-map-lookup-callsign"
                className={`text-[10px] font-medium tracking-wide uppercase ${muted}`}
              >
                {t("lookupLabel")}
              </label>
              <div className="mt-1 flex items-stretch gap-1.5">
                <input
                  id="ham-map-lookup-callsign"
                  value={lookupValue}
                  maxLength={15}
                  disabled={lookupPending}
                  placeholder={t("lookupPlaceholder")}
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(event) =>
                    onLookupValueChange?.(event.target.value.toUpperCase())
                  }
                  className={`min-w-0 flex-1 rounded-md border px-2.5 py-1.5 font-display text-sm tracking-wide uppercase outline-none disabled:opacity-50 ${fieldClass}`}
                />
                <button
                  type="submit"
                  disabled={lookupPending}
                  className={`shrink-0 rounded-md border px-2.5 text-xs font-medium transition disabled:opacity-50 ${buttonClass}`}
                >
                  {lookupPending ? t("lookupWorking") : t("lookupSubmit")}
                </button>
              </div>
              {lookupError ? (
                <p className={`mt-1 text-[11px] ${light ? "text-red-700" : "text-red-200"}`}>
                  {lookupError}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      </div>

      {showLogbookPrivateNotice ? (
        <p className={`rounded-lg border px-3 py-2 text-xs backdrop-blur-md ${notice}`}>
          {t("logbookPrivateNotice")}
        </p>
      ) : null}
    </aside>
  );
}
