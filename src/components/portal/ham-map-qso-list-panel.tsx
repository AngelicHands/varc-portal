"use client";

import { useTranslations } from "next-intl";
import type { QsoListItemDto } from "@/lib/account-types";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import { formatMaidenheadDisplay } from "@/lib/maidenhead";
import { formatQsoDateTime } from "@/lib/qso-datetime";

export const HAM_MAP_QSO_LIST_WIDTH_PX = 288; // w-72

type Props = {
  mapTheme: HamMapTheme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qsos: QsoListItemDto[];
  selectedQsoId: string | null;
  onSelectQso: (qsoId: string | null) => void;
};

export function HamMapQsoListPanel({
  mapTheme,
  open,
  onOpenChange,
  qsos,
  selectedQsoId,
  onSelectQso,
}: Props) {
  const t = useTranslations("ham.map");
  const light = mapTheme === "light";

  const panelClass = light
    ? "border-zinc-300/80 bg-white/95 text-zinc-900 shadow-xl shadow-zinc-900/15"
    : "border-white/10 bg-zinc-950/95 text-white shadow-2xl shadow-black/50";
  const handleClass = light
    ? "border-zinc-300/80 bg-white/95 text-zinc-800 shadow-xl shadow-zinc-900/15 hover:bg-zinc-50"
    : "border-white/10 bg-zinc-950/95 text-white shadow-2xl shadow-black/50 hover:bg-zinc-900";
  const rowBorder = light ? "border-zinc-200" : "border-white/10";
  const muted = light ? "text-zinc-500" : "text-white/55";
  const strong = light ? "text-zinc-900" : "text-white";
  const rowIdle = light ? "hover:bg-zinc-100" : "hover:bg-white/5";
  const rowActive = light ? "bg-zinc-200" : "bg-white/10";

  const sorted = [...qsos].sort((a, b) => b.qsoAt.localeCompare(a.qsoAt));

  return (
    <div
      className={`pointer-events-none absolute bottom-0 left-0 top-0 z-[25] flex transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      style={{ width: HAM_MAP_QSO_LIST_WIDTH_PX }}
    >
      <aside
        id="ham-map-qso-list"
        className={`pointer-events-auto flex h-full w-full flex-col border-r backdrop-blur-md ${panelClass}`}
        aria-label={t("qsoListTitle")}
      >
        <div className={`border-b px-4 py-3 ${rowBorder}`}>
          <p className={`text-sm font-medium ${strong}`}>{t("qsoListTitle")}</p>
          <p className={`mt-0.5 text-xs ${muted}`}>
            {t("qsoListCount", { count: sorted.length })}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <p className={`px-4 py-6 text-sm ${muted}`}>{t("qsoListEmpty")}</p>
          ) : (
            <ul>
              {sorted.map((qso) => {
                const selected = selectedQsoId === qso.id;
                return (
                  <li key={qso.id} className={`border-b ${rowBorder}`}>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectQso(selected ? null : qso.id)
                      }
                      aria-pressed={selected}
                      className={`w-full px-4 py-3 text-left transition ${selected ? rowActive : rowIdle}`}
                    >
                      <p className={`text-xs ${muted}`}>
                        {formatQsoDateTime(qso.qsoAt)}
                      </p>
                      <div className="mt-1 flex items-baseline justify-between gap-3">
                        <p
                          className={`min-w-0 truncate font-display text-base tracking-wide ${strong}`}
                        >
                          {qso.workedCallsign}
                        </p>
                        <p
                          className={`shrink-0 text-xs font-medium tabular-nums ${muted}`}
                        >
                          {qso.grid
                            ? formatMaidenheadDisplay(qso.grid)
                            : t("qsoListNoGrid")}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`pointer-events-auto absolute top-1/2 right-0 z-10 flex min-h-[9.5rem] w-11 translate-x-full -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-r-xl border border-l-0 px-1.5 py-3 shadow-lg backdrop-blur-md transition ${handleClass}`}
        aria-expanded={open}
        aria-controls="ham-map-qso-list"
        title={open ? t("qsoListCollapse") : t("qsoListExpand")}
      >
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
        <span
          className="max-h-[7rem] text-[10px] font-semibold tracking-[0.14em] uppercase"
          style={{ writingMode: "vertical-rl" }}
        >
          {t("qsoListHandle")}
        </span>
      </button>
    </div>
  );
}
