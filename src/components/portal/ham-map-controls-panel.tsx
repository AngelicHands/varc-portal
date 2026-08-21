"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { HamMapTheme } from "@/lib/map/maptiler-style";

type Props = {
  mapTheme: HamMapTheme;
  showGridRectangles: boolean;
  onToggleGridRectangles: () => void;
  showLocationMarkers: boolean;
  onToggleLocationMarkers: () => void;
  showCallsigns: boolean;
  onToggleCallsigns: () => void;
  showTraces: boolean;
  onToggleTraces: () => void;
  tracesAvailable?: boolean;
  isBrowserFullscreen: boolean;
  onToggleBrowserFullscreen: () => void;
  fullscreenSupported?: boolean;
};

function GridIcon({ className }: { className?: string }) {
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
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 3.5v17M14.5 3.5v17" />
    </svg>
  );
}

function MarkerIcon({ className }: { className?: string }) {
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
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.25" />
    </svg>
  );
}

function CallsignIcon({ className }: { className?: string }) {
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
      <path d="M3 12.5V4.5A1.5 1.5 0 0 1 4.5 3h8l8.5 8.5-9.5 9.5L3 12.5Z" />
      <circle cx="7.75" cy="7.75" r="1.25" />
    </svg>
  );
}

function TraceIcon({ className }: { className?: string }) {
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
      <circle cx="5" cy="17" r="2.25" />
      <circle cx="19" cy="7" r="2.25" />
      <path d="M7 15.5c2.5-1 5-5 10-7.5" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
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
      <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6" />
    </svg>
  );
}

function CompressIcon({ className }: { className?: string }) {
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
      <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M21 16h-5v5" />
    </svg>
  );
}

function ControlButton({
  active,
  idleClass,
  activeClass,
  borderClass,
  onClick,
  label,
  disabled,
  children,
}: {
  active: boolean;
  idleClass: string;
  activeClass: string;
  borderClass: string;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 w-10 items-center justify-center border-l transition first:border-l-0 disabled:cursor-not-allowed disabled:opacity-35 ${borderClass} ${active ? activeClass : idleClass}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </button>
  );
}

export function HamMapControlsPanel({
  mapTheme,
  showGridRectangles,
  onToggleGridRectangles,
  showLocationMarkers,
  onToggleLocationMarkers,
  showCallsigns,
  onToggleCallsigns,
  showTraces,
  onToggleTraces,
  tracesAvailable = true,
  isBrowserFullscreen,
  onToggleBrowserFullscreen,
  fullscreenSupported = true,
}: Props) {
  const t = useTranslations("ham.map");
  const light = mapTheme === "light";

  const panelClass = light
    ? "border-zinc-300/80 bg-white/90 text-zinc-900 shadow-xl shadow-zinc-900/10"
    : "border-white/10 bg-black/75 text-white shadow-2xl shadow-black/40";
  const idle = light
    ? "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    : "text-white/55 hover:bg-white/10 hover:text-white";
  const active = light
    ? "bg-zinc-200 text-zinc-900"
    : "bg-white/15 text-white";
  const border = light ? "border-zinc-200" : "border-white/10";

  return (
    <aside
      className={`pointer-events-auto flex overflow-hidden rounded-xl border backdrop-blur-md ${panelClass}`}
      aria-label={t("mapControlsLabel")}
    >
      <ControlButton
        active={showGridRectangles}
        idleClass={idle}
        activeClass={active}
        borderClass={border}
        onClick={onToggleGridRectangles}
        label={t("toggleGridRectangles")}
      >
        <GridIcon className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        active={showLocationMarkers}
        idleClass={idle}
        activeClass={active}
        borderClass={border}
        onClick={onToggleLocationMarkers}
        label={t("toggleLocationMarkers")}
      >
        <MarkerIcon className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        active={showCallsigns}
        idleClass={idle}
        activeClass={active}
        borderClass={border}
        onClick={onToggleCallsigns}
        label={t("toggleCallsigns")}
      >
        <CallsignIcon className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        active={showTraces}
        idleClass={idle}
        activeClass={active}
        borderClass={border}
        onClick={onToggleTraces}
        label={t("toggleTraces")}
        disabled={!tracesAvailable}
      >
        <TraceIcon className="h-4 w-4" />
      </ControlButton>
      {fullscreenSupported ? (
        <ControlButton
          active={isBrowserFullscreen}
          idleClass={idle}
          activeClass={active}
          borderClass={border}
          onClick={onToggleBrowserFullscreen}
          label={
            isBrowserFullscreen
              ? t("exitBrowserFullscreen")
              : t("enterBrowserFullscreen")
          }
        >
          {isBrowserFullscreen ? (
            <CompressIcon className="h-4 w-4" />
          ) : (
            <ExpandIcon className="h-4 w-4" />
          )}
        </ControlButton>
      ) : null}
    </aside>
  );
}
