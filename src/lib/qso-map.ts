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

function toCartesian(lat: number, lng: number) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  return {
    x: Math.cos(phi) * Math.cos(lambda),
    y: Math.cos(phi) * Math.sin(lambda),
    z: Math.sin(phi),
  };
}

function fromCartesian(x: number, y: number, z: number): [number, number] {
  const lng = (Math.atan2(y, x) * 180) / Math.PI;
  const hyp = Math.sqrt(x * x + y * y);
  const lat = (Math.atan2(z, hyp) * 180) / Math.PI;
  return [lng, lat];
}

/** Geodesic arc as [lng, lat] positions for MapLibre LineString. */
export function greatCircleCoordinates(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
  steps = 64,
): [number, number][] {
  const a = toCartesian(fromLat, fromLng);
  const b = toCartesian(toLat, toLng);
  let dot = a.x * b.x + a.y * b.y + a.z * b.z;
  dot = Math.min(1, Math.max(-1, dot));
  const omega = Math.acos(dot);
  if (!Number.isFinite(omega) || omega < 1e-8) {
    return [
      [fromLng, fromLat],
      [toLng, toLat],
    ];
  }

  const sinOmega = Math.sin(omega);
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const s0 = Math.sin((1 - t) * omega) / sinOmega;
    const s1 = Math.sin(t * omega) / sinOmega;
    coords.push(
      fromCartesian(s0 * a.x + s1 * b.x, s0 * a.y + s1 * b.y, s0 * a.z + s1 * b.z),
    );
  }
  return coords;
}

export type QsoTraceFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      grid: string;
      qsoCount: number;
    };
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
  }>;
};

/** Curved traces from the viewing station to each worked QSO grid. */
export function buildQsoTraceFeatureCollection(
  home: HomeGridMarker | null,
  qsoMarkers: QsoGridMarker[],
): QsoTraceFeatureCollection {
  if (!home || qsoMarkers.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  return {
    type: "FeatureCollection",
    features: qsoMarkers.map((item) => ({
      type: "Feature" as const,
      properties: {
        grid: item.grid,
        qsoCount: item.qsoCount,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: greatCircleCoordinates(
          home.lng,
          home.lat,
          item.lng,
          item.lat,
        ),
      },
    })),
  };
}

export const HAM_MAP_QSO_TIME_RANGES = [
  "15m",
  "30m",
  "1h",
  "4h",
  "6h",
  "12h",
  "24h",
  "7d",
  "1M",
  "6M",
  "1Y",
  "all",
] as const;

export type HamMapQsoTimeRange = (typeof HAM_MAP_QSO_TIME_RANGES)[number];

const TIME_RANGE_MS: Record<Exclude<HamMapQsoTimeRange, "all">, number> = {
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "6M": 182 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
};

export function isHamMapQsoTimeRange(value: string): value is HamMapQsoTimeRange {
  return (HAM_MAP_QSO_TIME_RANGES as readonly string[]).includes(value);
}

/** Keep QSOs whose `qsoAt` is within the selected lookback window (inclusive). */
export function filterQsosByTimeRange(
  qsos: QsoListItemDto[],
  range: HamMapQsoTimeRange,
  nowMs = Date.now(),
): QsoListItemDto[] {
  if (range === "all") return qsos;
  const cutoff = nowMs - TIME_RANGE_MS[range];
  return qsos.filter((qso) => {
    const at = Date.parse(qso.qsoAt);
    return Number.isFinite(at) && at >= cutoff;
  });
}
