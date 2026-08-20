import type { QsoListItemDto } from "@/lib/account-types";
import {
  isValidMaidenheadGrid,
  maidenheadBounds,
  maidenheadToLatLng,
  normalizeGrid,
  type MaidenheadBounds,
} from "@/lib/maidenhead";

export type QsoGridMarker = {
  grid: string;
  lat: number;
  lng: number;
  bounds: MaidenheadBounds;
  qsoCount: number;
  workedCallsigns: string[];
};

export type HomeGridMarker = {
  grid: string;
  /** Marker position: stored station location when available, else grid center. */
  lat: number;
  lng: number;
  bounds: MaidenheadBounds;
  callsign: string;
  /** True when lat/lng came from stored location, not grid center. */
  fromLocation: boolean;
};

export function aggregateQsoGridMarkers(qsos: QsoListItemDto[]): QsoGridMarker[] {
  const byGrid = new Map<string, { qsoCount: number; workedCallsigns: string[] }>();

  for (const qso of qsos) {
    const grid = normalizeGrid(qso.grid);
    if (!grid || !isValidMaidenheadGrid(grid)) continue;

    const entry = byGrid.get(grid) ?? { qsoCount: 0, workedCallsigns: [] };
    entry.qsoCount += 1;
    if (!entry.workedCallsigns.includes(qso.workedCallsign)) {
      entry.workedCallsigns.push(qso.workedCallsign);
    }
    byGrid.set(grid, entry);
  }

  const markers: QsoGridMarker[] = [];
  for (const [grid, stats] of byGrid.entries()) {
    const coords = maidenheadToLatLng(grid);
    const bounds = maidenheadBounds(grid);
    if (!coords || !bounds) continue;
    markers.push({
      grid,
      lat: coords.lat,
      lng: coords.lng,
      bounds,
      qsoCount: stats.qsoCount,
      workedCallsigns: stats.workedCallsigns.sort(),
    });
  }

  return markers.sort((a, b) => a.grid.localeCompare(b.grid));
}

export function buildHomeGridMarker(
  homeGrid: string,
  callsign: string,
  homeLat?: number | null,
  homeLng?: number | null,
): HomeGridMarker | null {
  const grid = normalizeGrid(homeGrid);
  if (!grid || !isValidMaidenheadGrid(grid)) return null;
  const bounds = maidenheadBounds(grid);
  const center = maidenheadToLatLng(grid);
  if (!bounds || !center) return null;

  const hasLocation =
    typeof homeLat === "number" &&
    Number.isFinite(homeLat) &&
    typeof homeLng === "number" &&
    Number.isFinite(homeLng);

  return {
    grid,
    lat: hasLocation ? homeLat : center.lat,
    lng: hasLocation ? homeLng : center.lng,
    bounds,
    callsign: callsign.trim().toUpperCase(),
    fromLocation: hasLocation,
  };
}
