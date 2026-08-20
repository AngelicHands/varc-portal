/** Maidenhead locator (4–12 chars, even length for full squares). */
const MAIDENHEAD_RE =
  /^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?)?)?$/i;

/** Full extent (degrees) of the finest square for a given locator length. */
const FULL_EXTENT: Record<number, { dLng: number; dLat: number }> = {
  4: { dLng: 2, dLat: 1 }, // 2° × 1°
  6: { dLng: 2 / 24, dLat: 1 / 24 }, // 5′ × 2.5′
  8: { dLng: 2 / 240, dLat: 1 / 240 }, // 0.5′ × 0.25′
  10: { dLng: 2 / 5760, dLat: 1 / 5760 },
  12: { dLng: 2 / 138_240, dLat: 1 / 138_240 },
};

export type MaidenheadBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export function normalizeGrid(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Display form: last two characters lowercased (e.g. OL20VX → OL20vx). */
export function formatMaidenheadDisplay(raw: string): string {
  const grid = normalizeGrid(raw);
  if (grid.length < 2) return grid;
  return `${grid.slice(0, -2)}${grid.slice(-2).toLowerCase()}`;
}

export function isValidMaidenheadGrid(raw: string): boolean {
  const grid = normalizeGrid(raw);
  if (grid.length < 4 || grid.length > 12 || grid.length % 2 !== 0) {
    return false;
  }
  return MAIDENHEAD_RE.test(grid);
}

/**
 * South-west corner of a Maidenhead square (no centering).
 * Intermediate levels must not be pre-centered — see maidenheadToLatLng.
 */
function maidenheadSouthWest(g: string): { lat: number; lng: number } | null {
  if (!isValidMaidenheadGrid(g)) return null;

  let lng = (g.charCodeAt(0) - 65) * 20 - 180;
  let lat = (g.charCodeAt(1) - 65) * 10 - 90;

  if (g.length >= 4) {
    lng += Number(g[2]) * 2;
    lat += Number(g[3]) * 1;
  }
  if (g.length >= 6) {
    lng += (g.charCodeAt(4) - 65) * (2 / 24);
    lat += (g.charCodeAt(5) - 65) * (1 / 24);
  }
  if (g.length >= 8) {
    lng += Number(g[6]) * (2 / 240);
    lat += Number(g[7]) * (1 / 240);
  }
  if (g.length >= 10) {
    lng += (g.charCodeAt(8) - 65) * (2 / 5760);
    lat += (g.charCodeAt(9) - 65) * (1 / 5760);
  }
  if (g.length >= 12) {
    lng += Number(g[10]) * (2 / 138_240);
    lat += Number(g[11]) * (1 / 138_240);
  }

  return { lat, lng };
}

/** Bounding box of a Maidenhead grid square (west/south/east/north). */
export function maidenheadBounds(raw: string): MaidenheadBounds | null {
  const grid = normalizeGrid(raw);
  const sw = maidenheadSouthWest(grid);
  const extent = FULL_EXTENT[grid.length];
  if (!sw || !extent) return null;

  return {
    west: sw.lng,
    south: sw.lat,
    east: sw.lng + extent.dLng,
    north: sw.lat + extent.dLat,
  };
}

/**
 * Center latitude/longitude for a Maidenhead grid square.
 *
 * Compute the south-west corner from each pair of characters, then offset by
 * half the size of the finest square. Do **not** center intermediate levels
 * with +0.5 before applying finer digits — that shifts 6+ character locators
 * north-east (e.g. OL20VX → ~106.8°E instead of ~105.8°E).
 */
export function maidenheadToLatLng(
  raw: string,
): { lat: number; lng: number } | null {
  const grid = normalizeGrid(raw);
  const bounds = maidenheadBounds(grid);
  if (!bounds) return null;

  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
}

/** Closed ring [lng, lat][] for a GeoJSON polygon of the grid square. */
export function maidenheadPolygonRing(
  raw: string,
): [number, number][] | null {
  const bounds = maidenheadBounds(raw);
  if (!bounds) return null;
  const { west, south, east, north } = bounds;
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/**
 * Encode WGS84 coordinates to a Maidenhead locator.
 * @param precision Even length 4–12 (default 6 = subsquare).
 */
export function latLngToMaidenhead(
  lat: number,
  lng: number,
  precision = 6,
): string | null {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  if (precision < 4 || precision > 12 || precision % 2 !== 0) return null;

  let lon = lng + 180;
  let la = lat + 90;
  let result = "";

  // Field (20° × 10°)
  const fieldLon = Math.floor(lon / 20);
  const fieldLat = Math.floor(la / 10);
  result += String.fromCharCode(65 + fieldLon, 65 + fieldLat);
  lon -= fieldLon * 20;
  la -= fieldLat * 10;
  if (precision === 2) return result;

  // Square (2° × 1°)
  const squareLon = Math.floor(lon / 2);
  const squareLat = Math.floor(la / 1);
  result += String(squareLon) + String(squareLat);
  lon -= squareLon * 2;
  la -= squareLat * 1;
  if (precision === 4) return result;

  // Subsquare (5′ × 2.5′)
  const subLon = Math.floor(lon / (2 / 24));
  const subLat = Math.floor(la / (1 / 24));
  result += String.fromCharCode(65 + subLon, 65 + subLat);
  lon -= subLon * (2 / 24);
  la -= subLat * (1 / 24);
  if (precision === 6) return result;

  // Extended square (0.5′ × 0.25′)
  const extLon = Math.floor(lon / (2 / 240));
  const extLat = Math.floor(la / (1 / 240));
  result += String(extLon) + String(extLat);
  lon -= extLon * (2 / 240);
  la -= extLat * (1 / 240);
  if (precision === 8) return result;

  const sub2Lon = Math.floor(lon / (2 / 5760));
  const sub2Lat = Math.floor(la / (1 / 5760));
  result += String.fromCharCode(65 + sub2Lon, 65 + sub2Lat);
  lon -= sub2Lon * (2 / 5760);
  la -= sub2Lat * (1 / 5760);
  if (precision === 10) return result;

  const ext2Lon = Math.floor(lon / (2 / 138_240));
  const ext2Lat = Math.floor(la / (1 / 138_240));
  result += String(ext2Lon) + String(ext2Lat);
  return result;
}

export function pointInMaidenheadBounds(
  lat: number,
  lng: number,
  bounds: MaidenheadBounds,
): boolean {
  return (
    lng >= bounds.west &&
    lng <= bounds.east &&
    lat >= bounds.south &&
    lat <= bounds.north
  );
}
