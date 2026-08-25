"use client";

import { useTranslations } from "next-intl";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import {
  HAM_MAP_QSO_TIME_RANGES,
  type HamMapQsoTimeRange,
} from "@/lib/qso-map";

type Props = {
  mapTheme: HamMapTheme;
  value: HamMapQsoTimeRange;
  onChange: (value: HamMapQsoTimeRange) => void;
  /** Stagger each option in from the gear (top → bottom). */
  stagger?: boolean;
  /** Delay before the first option starts (ms). */
  staggerBaseDelayMs?: number;
  /** Gap between each option (ms). */
  staggerStepMs?: number;
};

export function HamMapQsoTimeFilter({
  mapTheme,
  value,
  onChange,
  stagger = false,
  staggerBaseDelayMs = 280,
  staggerStepMs = 55,
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
    <div
      className={`pointer-events-auto flex max-h-[min(70dvh,calc(100dvh-5.5rem))] flex-col overflow-y-auto overflow-x-hidden rounded-xl border backdrop-blur-md ${panelClass}`}
      role="group"
      aria-label={t("qsoTimeFilterLabel")}
    >
      {HAM_MAP_QSO_TIME_RANGES.map((range, index) => {
        const selected = value === range;
        return (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            aria-pressed={selected}
            title={range === "all" ? t("qsoTimeFilterAll") : range}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center border-t text-[10px] font-medium leading-none transition first:border-t-0 ${border} ${selected ? active : idle}${
              stagger ? " ham-map-chrome-in-down" : ""
            }`}
            style={
              stagger
                ? {
                    animationDelay: `${staggerBaseDelayMs + index * staggerStepMs}ms`,
                  }
                : undefined
            }
          >
            {range === "all" ? t("qsoTimeFilterAll") : range}
          </button>
        );
      })}
    </div>
  );
}
