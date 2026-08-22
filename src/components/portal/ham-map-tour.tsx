"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import {
  HAM_MAP_TOUR_ANCHORS,
  HAM_MAP_TOUR_CLAMPED_STEPS,
  HAM_MAP_TOUR_MAP_SPOT_STEPS,
  HAM_MAP_TOUR_STEP_IDS,
  hasSeenHamMapTour,
  markHamMapTourSeen,
  type HamMapTourSpotRect,
  type HamMapTourStepId,
} from "@/lib/map/ham-map-tour";

type SpotRect = HamMapTourSpotRect;

type Props = {
  mapTheme: HamMapTheme;
  enabled?: boolean;
  autoStart?: boolean;
  /** When set, auto-start waits until this flips true (e.g. location acquired). */
  autoStartWhen?: boolean;
  /** Viewport rect for map spotlight steps (grid field, location pin, …). */
  mapSpotRect?: SpotRect | null;
  onStepChange?: (stepId: HamMapTourStepId | null, open: boolean) => void;
  children: (api: { startTour: () => void }) => React.ReactNode;
};

function stepAnchorId(step: HamMapTourStepId): string {
  return HAM_MAP_TOUR_ANCHORS[step];
}

function readSpot(
  step: HamMapTourStepId,
  mapSpotRect?: SpotRect | null,
): SpotRect | null {
  if (HAM_MAP_TOUR_MAP_SPOT_STEPS.has(step) && mapSpotRect) {
    const pad = 10;
    return {
      top: Math.max(0, mapSpotRect.top - pad),
      left: Math.max(0, mapSpotRect.left - pad),
      width: mapSpotRect.width + pad * 2,
      height: mapSpotRect.height + pad * 2,
    };
  }

  const el = document.getElementById(stepAnchorId(step));
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;

  const pad = 10;

  if (HAM_MAP_TOUR_CLAMPED_STEPS.has(step)) {
    const maxW = Math.min(320, rect.width * 0.45);
    const maxH = Math.min(220, rect.height * 0.4);
    const width = Math.max(160, maxW);
    const height = Math.max(120, maxH);
    return {
      top: rect.top + (rect.height - height) / 2,
      left: rect.left + (rect.width - width) / 2,
      width,
      height,
    };
  }

  return {
    top: Math.max(0, rect.top - pad),
    left: Math.max(0, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
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

export function HamMapTourHelpButton({
  mapTheme,
  onClick,
}: {
  mapTheme: HamMapTheme;
  onClick: () => void;
}) {
  const t = useTranslations("ham.map");
  const light = mapTheme === "light";
  const panelClass = light
    ? "border-zinc-300/80 bg-white/90 text-zinc-900 shadow-xl shadow-zinc-900/10"
    : "border-white/10 bg-black/75 text-white shadow-2xl shadow-black/40";
  const idle = light
    ? "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    : "text-white/55 hover:bg-white/10 hover:text-white";

  return (
    <button
      id={HAM_MAP_TOUR_ANCHORS.done}
      type="button"
      onClick={onClick}
      title={t("tourHelp")}
      aria-label={t("tourHelp")}
      className={`pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur-md transition ${panelClass} ${idle}`}
    >
      <HelpIcon className="h-4 w-4" />
    </button>
  );
}

export function HamMapTour({
  mapTheme,
  enabled = true,
  autoStart = true,
  autoStartWhen = true,
  mapSpotRect = null,
  onStepChange,
  children,
}: Props) {
  const t = useTranslations("ham.map");
  const titleId = useId();
  const bodyId = useId();
  const maskId = useId().replace(/:/g, "");
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotTick, setSpotTick] = useState(0);
  const startedRef = useRef(false);

  const stepId = HAM_MAP_TOUR_STEP_IDS[stepIndex] ?? "welcome";
  const isLast = stepIndex >= HAM_MAP_TOUR_STEP_IDS.length - 1;
  const light = mapTheme === "light";
  const spot = open ? readSpot(stepId, mapSpotRect) : null;
  void spotTick;
  void mapSpotRect;

  useEffect(() => {
    onStepChange?.(open ? stepId : null, open);
  }, [open, stepId, onStepChange]);

  useEffect(() => {
    if (!open || !HAM_MAP_TOUR_MAP_SPOT_STEPS.has(stepId)) return;
    const frame = window.requestAnimationFrame(() => {
      setSpotTick((value) => value + 1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, stepId, mapSpotRect]);

  const closeTour = useCallback((persist: boolean) => {
    setOpen(false);
    setStepIndex(0);
    if (persist) markHamMapTourSeen();
  }, []);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setOpen(true);
    setSpotTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !autoStart || !autoStartWhen || startedRef.current) return;
    if (hasSeenHamMapTour()) {
      startedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      startTour();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [enabled, autoStart, autoStartWhen, startTour]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setSpotTick((value) => value + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTour(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeTour]);

  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (!node) return;
    const focusable = node.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    first?.focus();

    function onTab(event: KeyboardEvent) {
      if (event.key !== "Tab" || focusable.length === 0) return;
      const items = [...focusable];
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          items[items.length - 1]?.focus();
        }
      } else if (currentIndex === items.length - 1) {
        event.preventDefault();
        items[0]?.focus();
      }
    }
    node.addEventListener("keydown", onTab);
    return () => node.removeEventListener("keydown", onTab);
  }, [open, stepIndex]);

  // Remeasure after the step changes so anchors that just mounted are found.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      setSpotTick((value) => value + 1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, stepIndex]);

  const panelClass = light
    ? "border-zinc-300/80 bg-white text-zinc-900 shadow-2xl shadow-zinc-900/20"
    : "border-white/15 bg-zinc-950 text-white shadow-2xl shadow-black/50";
  const muted = light ? "text-zinc-500" : "text-white/60";
  const btnGhost = light
    ? "text-zinc-600 hover:bg-zinc-100"
    : "text-white/70 hover:bg-white/10";
  const btnPrimary = light
    ? "bg-zinc-900 text-white hover:bg-zinc-800"
    : "bg-white text-zinc-900 hover:bg-zinc-100";

  const tooltipStyle = (() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const width = Math.min(320, vw - 24);
    if (!spot) {
      return {
        top: Math.max(16, vh / 2 - 80),
        left: Math.max(12, (vw - width) / 2),
        width,
      };
    }
    const preferLeft = spot.left + spot.width / 2 > vw / 2;
    let left = preferLeft
      ? spot.left - width - 12
      : spot.left + spot.width + 12;
    left = Math.min(Math.max(12, left), vw - width - 12);
    let top = spot.top;
    top = Math.min(Math.max(12, top), vh - 220);
    return { top, left, width };
  })();

  return (
    <>
      {children({ startTour })}

      {open ? (
        <div
          className="pointer-events-auto fixed inset-0 z-[80]"
          role="presentation"
        >
          {/* Single dim layer with a clear cutout so the target stays visible. */}
          <svg
            className="absolute inset-0 h-full w-full"
            aria-hidden
            onClick={() => closeTour(true)}
          >
            <defs>
              <mask id={maskId}>
                <rect width="100%" height="100%" fill="white" />
                {spot ? (
                  <rect
                    x={spot.left}
                    y={spot.top}
                    width={spot.width}
                    height={spot.height}
                    rx="14"
                    ry="14"
                    fill="black"
                  />
                ) : null}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.62)"
              mask={`url(#${maskId})`}
            />
          </svg>

          {spot ? (
            <div
              className="pointer-events-none absolute rounded-[14px] ring-2 ring-sky-300 shadow-[0_0_0_6px_rgba(56,189,248,0.35)] animate-pulse"
              style={{
                top: spot.top,
                left: spot.left,
                width: spot.width,
                height: spot.height,
              }}
              aria-hidden
            />
          ) : null}

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            className={`absolute rounded-xl border p-4 backdrop-blur-md ${panelClass}`}
            style={{
              top: tooltipStyle.top,
              left: tooltipStyle.left,
              width: tooltipStyle.width,
            }}
          >
            <p
              className={`text-[10px] font-medium tracking-[0.16em] uppercase ${muted}`}
            >
              {t("tourStepOf", {
                step: stepIndex + 1,
                total: HAM_MAP_TOUR_STEP_IDS.length,
              })}
            </p>
            <h2 id={titleId} className="mt-1 text-base font-semibold">
              {t(`tourSteps.${stepId}.title`)}
            </h2>
            <p id={bodyId} className={`mt-2 text-sm leading-relaxed ${muted}`}>
              {t(`tourSteps.${stepId}.body`)}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => closeTour(true)}
                className={`rounded-md px-2.5 py-1.5 text-sm transition ${btnGhost}`}
              >
                {t("tourSkip")}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={stepIndex === 0}
                  onClick={() =>
                    setStepIndex((current) => Math.max(0, current - 1))
                  }
                  className={`rounded-md px-2.5 py-1.5 text-sm transition disabled:pointer-events-none disabled:opacity-40 ${btnGhost}`}
                >
                  {t("tourBack")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isLast) {
                      closeTour(true);
                      return;
                    }
                    setStepIndex((current) =>
                      Math.min(HAM_MAP_TOUR_STEP_IDS.length - 1, current + 1),
                    );
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${btnPrimary}`}
                >
                  {isLast ? t("tourFinish") : t("tourNext")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
