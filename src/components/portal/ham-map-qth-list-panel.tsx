"use client";

import { useTranslations } from "next-intl";
import { HAM_MAP_QSO_LIST_WIDTH_PX } from "@/components/portal/ham-map-qso-list-panel";
import { formatMaidenheadDisplay } from "@/lib/maidenhead";
import type { HamMapTheme } from "@/lib/map/maptiler-style";
import type { PublicHamLocationStation } from "@/lib/qth-locations";

export { HAM_MAP_QSO_LIST_WIDTH_PX as HAM_MAP_QTH_LIST_WIDTH_PX };

type Props = {
  mapTheme: HamMapTheme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stations: PublicHamLocationStation[];
  selectedCallsign: string | null;
  viewerCallsign?: string;
  onSelectStation: (callsign: string | null) => void;
};

export function HamMapQthListPanel({
  mapTheme,
  open,
  onOpenChange,
  stations,
  selectedCallsign,
  viewerCallsign = "",
  onSelectStation,
}: Props) {
  const t = useTranslations("ham.qth");
  const light = mapTheme === "light";
  const normalizedViewerCallsign = viewerCallsign.trim().toUpperCase();

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
  const rowSelectedStation = light
    ? "border-l-2 border-l-emerald-600 bg-zinc-200"
    : "border-l-2 border-l-emerald-400 bg-white/10";
  const rowSelectedViewer = light
    ? "border-l-2 border-l-violet-600 bg-zinc-200"
    : "border-l-2 border-l-violet-400 bg-white/10";
  const viewerBadge = light
    ? "bg-violet-100 text-violet-700"
    : "bg-violet-500/25 text-violet-300";

  return (
    <div
      className={`pointer-events-none absolute bottom-0 left-0 top-0 z-[25] flex transition-[translate] duration-300 ease-in-out motion-reduce:transition-none ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      style={{ width: HAM_MAP_QSO_LIST_WIDTH_PX }}
    >
      <aside
        id="ham-map-qth-list"
        className={`pointer-events-auto flex h-full w-full flex-col border-r backdrop-blur-md ${panelClass}`}
        aria-label={t("listTitle")}
      >
        <div
          className={`flex items-start justify-between gap-2 border-b px-4 py-3 ${rowBorder}`}
        >
          <div className="min-w-0">
            <p className={`text-sm font-medium ${strong}`}>{t("listTitle")}</p>
            <p className={`mt-0.5 text-xs ${muted}`}>
              {t("listCount", { count: stations.length })}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {stations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 py-8">
              <p className={`text-center text-sm text-balance ${muted}`}>
                {t("listEmpty")}
              </p>
            </div>
          ) : (
            <ul>
              {stations.map((station) => {
                const selected = selectedCallsign === station.callsign;
                const isViewer =
                  Boolean(normalizedViewerCallsign) &&
                  station.callsign === normalizedViewerCallsign;
                return (
                  <li
                    key={station.callsign}
                    className={`border-b ${rowBorder}`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onSelectStation(selected ? null : station.callsign)
                      }
                      aria-pressed={selected}
                      aria-current={selected ? "true" : undefined}
                      className={`w-full border-l-2 py-3 pr-4 text-left transition ${
                        selected
                          ? `${isViewer ? rowSelectedViewer : rowSelectedStation} pl-[14px]`
                          : `border-l-transparent pl-4 ${rowIdle}`
                      }`}
                    >
                      <p className={`truncate text-sm font-medium ${strong}`}>
                        {station.name}
                        {isViewer ? (
                          <span
                            className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${viewerBadge}`}
                          >
                            {t("youBadge")}
                          </span>
                        ) : null}
                        {station.verified ? (
                          <span className={`ml-1.5 text-[10px] font-normal ${muted}`}>
                            ({t("verified")})
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-1 flex items-baseline justify-between gap-3">
                        <p
                          className={`min-w-0 truncate font-display text-base tracking-wide ${strong}`}
                        >
                          {station.callsign}
                        </p>
                        <p
                          className={`shrink-0 text-xs font-medium tabular-nums ${muted}`}
                        >
                          {formatMaidenheadDisplay(station.homeMarker.grid)}
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
        aria-controls="ham-map-qth-list"
        title={open ? t("listCollapse") : t("listExpand")}
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
          {t("listHandle")}
        </span>
      </button>
    </div>
  );
}
