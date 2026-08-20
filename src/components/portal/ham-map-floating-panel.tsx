"use client";

import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import { formatMaidenheadDisplay } from "@/lib/maidenhead";

type Props = {
  callsign: string;
  operatorName: string;
  operatorImage?: string | null;
  verified: boolean;
  homeGrid: string;
  branding: { siteName: string; logoUrl?: string };
  mapTheme: HamMapTheme;
  themeReady?: boolean;
  onMapThemeChange: (theme: HamMapTheme) => void;
  showLogbookPrivateNotice: boolean;
  mapAvailable?: boolean;
  onFocusHomeGrid?: () => void;
  /** Extra left offset when the QSO list drawer is open. */
  offsetLeft?: number;
};

function initialsFrom(name: string, callsign: string): string {
  const fromName = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  if (fromName) return fromName;
  return callsign.trim().slice(0, 2).toUpperCase() || "?";
}

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

export function HamMapFloatingPanel({
  callsign,
  operatorName,
  operatorImage,
  verified,
  homeGrid,
  branding,
  mapTheme,
  themeReady = true,
  onMapThemeChange,
  showLogbookPrivateNotice,
  mapAvailable = true,
  onFocusHomeGrid,
  offsetLeft = 0,
}: Props) {
  const t = useTranslations("ham.map");
  const light = mapTheme === "light";

  const panelClass = light
    ? "border-zinc-300/80 bg-white/90 text-zinc-900 shadow-xl shadow-zinc-900/10"
    : "border-white/10 bg-black/75 text-white shadow-2xl shadow-black/40";
  const muted = light ? "text-zinc-500" : "text-white/60";
  const soft = light ? "text-zinc-700" : "text-white/80";
  const strong = light ? "text-zinc-900" : "text-white";
  const avatarRing = light ? "ring-zinc-200 bg-zinc-100" : "ring-white/15 bg-white/10";
  const themeIdle = light
    ? "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    : "text-white/55 hover:bg-white/10 hover:text-white";
  const themeActive = light
    ? "bg-zinc-200 text-zinc-900"
    : "bg-white/15 text-white";
  const notice = light
    ? "border-amber-300/70 bg-amber-50 text-amber-950"
    : "border-amber-400/30 bg-amber-500/10 text-amber-100";
  const verifiedClass = light ? "text-emerald-600" : "text-emerald-300";

  const initials = initialsFrom(operatorName, callsign);
  const profileHref = {
    pathname: "/[callsign]" as const,
    params: { callsign },
  };
  const profileHover = light ? "hover:opacity-80" : "hover:opacity-90";

  return (
    <aside
      className="pointer-events-auto absolute top-3 z-20 flex max-w-[min(100%-1.5rem,22rem)] flex-col gap-2 transition-[left] duration-300 ease-out"
      style={{ left: 12 + offsetLeft }}
    >
      <div
        className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 backdrop-blur-md ${panelClass}`}
      >
        <NextLink
          href="/"
          className="shrink-0 self-center"
          aria-label={branding.siteName}
          title={branding.siteName}
        >
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt=""
              className="h-9 w-9 rounded-md object-contain"
            />
          ) : (
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold ${light ? "bg-zinc-100" : "bg-white/10"}`}
            >
              {branding.siteName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </NextLink>

        <Link
          href={profileHref}
          className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 transition ${avatarRing} ${profileHover}`}
          aria-label={t("backToProfile")}
        >
          {operatorImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={operatorImage}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className={`text-xs font-semibold tracking-wide ${strong}`}>
              {initials}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={profileHref}
              className={`truncate font-display text-lg leading-tight tracking-wide transition ${strong} ${profileHover}`}
            >
              {callsign}
            </Link>
            {verified ? (
              <span
                className={`inline-flex shrink-0 ${verifiedClass}`}
                title={t("verifiedCallsign")}
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M3.5 8.5 6.5 11.5 12.5 5.5" />
                </svg>
              </span>
            ) : null}
          </div>
          {operatorName ? (
            <Link
              href={profileHref}
              className={`mt-0.5 block truncate text-sm leading-snug transition ${soft} ${profileHover}`}
            >
              {operatorName}
            </Link>
          ) : null}
          <div className="mt-1.5 flex items-center gap-2">
            <p className={`min-w-0 flex-1 truncate text-xs ${muted}`}>
              {homeGrid && onFocusHomeGrid ? (
                <button
                  type="button"
                  onClick={onFocusHomeGrid}
                  className={`font-medium underline-offset-2 transition hover:underline ${strong}`}
                  title={t("focusHomeGrid")}
                >
                  {formatMaidenheadDisplay(homeGrid)}
                </button>
              ) : homeGrid ? (
                <span className={`font-medium ${strong}`}>
                  {formatMaidenheadDisplay(homeGrid)}
                </span>
              ) : (
                <span>—</span>
              )}
            </p>
            <div
              className={`inline-flex shrink-0 overflow-hidden rounded-md border ${light ? "border-zinc-300" : "border-white/15"}`}
              role="group"
              aria-label={t("themeLabel")}
            >
              <button
                type="button"
                disabled={!mapAvailable}
                onClick={() => onMapThemeChange("light")}
                className={`inline-flex h-7 w-7 items-center justify-center disabled:opacity-40 ${themeReady && mapTheme === "light" ? themeActive : themeIdle}`}
                aria-label={t("themeLight")}
                aria-pressed={themeReady && mapTheme === "light"}
              >
                <SunIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!mapAvailable}
                onClick={() => onMapThemeChange("dark")}
                className={`inline-flex h-7 w-7 items-center justify-center disabled:opacity-40 ${themeReady && mapTheme === "dark" ? themeActive : themeIdle}`}
                aria-label={t("themeDark")}
                aria-pressed={themeReady && mapTheme === "dark"}
              >
                <MoonIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showLogbookPrivateNotice ? (
        <p
          className={`rounded-lg border px-3 py-2 text-xs backdrop-blur-md ${notice}`}
        >
          {t("logbookPrivateNotice")}
        </p>
      ) : null}
    </aside>
  );
}
