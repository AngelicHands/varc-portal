"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import { HAM_MAP_TOUR_ANCHORS } from "@/lib/map/ham-map-tour";
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
  /** When set, Tour appears beside the mobile settings strip. */
  onStartTour?: () => void;
  /** Controlled open state for the small-screen settings chrome. */
  mobileMenuOpen?: boolean;
  onMobileMenuOpenChange?: (open: boolean) => void;
  /**
   * Extra element(s) treated as "inside" the menu for outside-click dismiss
   * (e.g. the time filter that appears with the gear menu).
   */
  mobileDismissRootRef?: RefObject<HTMLElement | null>;
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

function GearIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.998 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function HelpIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.7.4-1.3 1-1.3 1.9V14" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
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
  disabled = false,
  className = "",
  style,
  children,
}: {
  active: boolean;
  idleClass: string;
  activeClass: string;
  borderClass: string;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Avoid the HTML `disabled` attribute: React omits it when false (`null`)
      // and sets it when true, which hydrates poorly when availability differs
      // between server (Date/location) and client.
      suppressHydrationWarning
      style={style}
      className={`inline-flex h-10 w-10 items-center justify-center border-l transition first:border-l-0 ${borderClass} ${
        disabled
          ? "cursor-not-allowed opacity-35"
          : active
            ? activeClass
            : idleClass
      } ${className}`}
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
  tracesAvailable = false,
  isBrowserFullscreen,
  onToggleBrowserFullscreen,
  fullscreenSupported = false,
  onStartTour,
  mobileMenuOpen: mobileMenuOpenProp,
  onMobileMenuOpenChange,
  mobileDismissRootRef,
}: Props) {
  const t = useTranslations("ham.map");
  const light = mapTheme === "light";
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = mobileMenuOpenProp !== undefined;
  const menuOpen = controlled ? mobileMenuOpenProp : uncontrolledOpen;

  const setMenuOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      if (controlled) {
        const value =
          typeof next === "function"
            ? next(Boolean(mobileMenuOpenProp))
            : next;
        onMobileMenuOpenChange?.(value);
        return;
      }
      setUncontrolledOpen((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        onMobileMenuOpenChange?.(value);
        return value;
      });
    },
    [controlled, mobileMenuOpenProp, onMobileMenuOpenChange],
  );

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

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      if (target && mobileDismissRootRef?.current?.contains(target)) return;
      setMenuOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, mobileDismissRootRef, setMenuOpen]);

  function renderControlButtons({
    includeFullscreen,
    staggerFromGear = false,
  }: {
    includeFullscreen: boolean;
    /** Stagger appear from the gear (right) toward the left. */
    staggerFromGear?: boolean;
  }) {
    const layerCount = 4;
    function staggerProps(fromGearIndex: number) {
      if (!staggerFromGear) return {};
      return {
        className: "ham-map-chrome-in",
        style: {
          animationDelay: `${40 + fromGearIndex * 55}ms`,
        } satisfies CSSProperties,
      };
    }

    return (
      <>
        <ControlButton
          active={showGridRectangles}
          idleClass={idle}
          activeClass={active}
          borderClass={border}
          onClick={onToggleGridRectangles}
          label={t("toggleGridRectangles")}
          {...staggerProps(layerCount - 1)}
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
          {...staggerProps(layerCount - 2)}
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
          {...staggerProps(layerCount - 3)}
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
          {...staggerProps(0)}
        >
          <TraceIcon className="h-4 w-4" />
        </ControlButton>
        {includeFullscreen && fullscreenSupported ? (
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
      </>
    );
  }

  const helpStaggerDelayMs = 40 + 4 * 55;

  return (
    <div ref={rootRef} className="pointer-events-auto">
      {/* Small screens: gear stays fixed; strip opens to its left */}
      <div className="relative h-10 w-10 shrink-0 md:hidden">
        {menuOpen ? (
          <div className="absolute top-0 right-full mr-2 flex items-center gap-2">
            {onStartTour ? (
              <button
                type="button"
                id={HAM_MAP_TOUR_ANCHORS.done}
                onClick={() => {
                  setMenuOpen(false);
                  onStartTour();
                }}
                title={t("tourHelp")}
                aria-label={t("tourHelp")}
                className={`ham-map-chrome-in inline-flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur-md ${panelClass} ${idle}`}
                style={{ animationDelay: `${helpStaggerDelayMs}ms` }}
              >
                <HelpIcon className="h-4 w-4" />
              </button>
            ) : null}
            <aside
              id={menuId}
              className={`flex overflow-hidden rounded-xl border backdrop-blur-md ${panelClass}`}
              aria-label={t("mapControlsLabel")}
            >
              {renderControlButtons({
                includeFullscreen: false,
                staggerFromGear: true,
              })}
            </aside>
          </div>
        ) : null}

        <button
          type="button"
          id={!menuOpen && onStartTour ? HAM_MAP_TOUR_ANCHORS.done : undefined}
          onClick={() => setMenuOpen((open) => !open)}
          className={`absolute inset-0 inline-flex items-center justify-center rounded-xl border backdrop-blur-md transition ${panelClass} ${idle} ${
            menuOpen ? active : ""
          }`}
          aria-label={t("mapSettingsMenu")}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          title={t("mapSettingsMenu")}
        >
          <GearIcon className="h-4 w-4" />
        </button>
      </div>

      {/* md+: always show the full control strip */}
      <aside
        className={`hidden overflow-hidden rounded-xl border backdrop-blur-md md:flex ${panelClass}`}
        aria-label={t("mapControlsLabel")}
      >
        {renderControlButtons({ includeFullscreen: true })}
      </aside>
    </div>
  );
}
