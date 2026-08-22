export const HAM_MAP_TOUR_STORAGE_KEY = "ham-map-tour-v1";

export function hasSeenHamMapTour(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(HAM_MAP_TOUR_STORAGE_KEY) === "1";
}

export function markHamMapTourSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HAM_MAP_TOUR_STORAGE_KEY, "1");
}

export const HAM_MAP_TOUR_STEP_IDS = [
  "welcome",
  "timeFilter",
  "layers",
  "qsoList",
  "pins",
  "locationPin",
  "done",
] as const;

export type HamMapTourStepId = (typeof HAM_MAP_TOUR_STEP_IDS)[number];

/** DOM hooks for coach-mark positioning. */
export const HAM_MAP_TOUR_ANCHORS = {
  welcome: "ham-map-tour-welcome",
  timeFilter: "ham-map-tour-time-filter",
  layers: "ham-map-tour-layers",
  qsoList: "ham-map-tour-qso-list",
  pins: "ham-map-tour-pins",
  locationPin: "ham-map-tour-location-pin",
  done: "ham-map-tour-help",
} as const;

/** Map steps that use a computed viewport spotlight rect from the parent. */
export const HAM_MAP_TOUR_MAP_SPOT_STEPS = new Set<HamMapTourStepId>([
  "pins",
  "locationPin",
]);

/** Steps that spotlight a clamped region inside a large map surface. */
export const HAM_MAP_TOUR_CLAMPED_STEPS = new Set<HamMapTourStepId>([]);

export type HamMapTourSpotRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type MapProject = {
  project(lngLat: [number, number]): { x: number; y: number };
  getContainer(): HTMLElement;
};

/** Viewport rect covering Maidenhead grid field(s) and location pin(s) on the map. */
export function computeLocationPinsTourSpot(
  map: MapProject,
  ...markers: Array<
    | {
        lat: number;
        lng: number;
        bounds: {
          north: number;
          south: number;
          east: number;
          west: number;
        };
      }
    | null
    | undefined
  >
): HamMapTourSpotRect | null {
  const container = map.getContainer().getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const marker of markers) {
    if (!marker) continue;
    const points: [number, number][] = [
      [marker.bounds.west, marker.bounds.north],
      [marker.bounds.east, marker.bounds.north],
      [marker.bounds.east, marker.bounds.south],
      [marker.bounds.west, marker.bounds.south],
      [marker.lng, marker.lat],
    ];
    for (const [lng, lat] of points) {
      const point = map.project([lng, lat]);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX)) return null;

  const pinPadTop = 36;
  const pinPadBottom = 12;
  const padX = 16;

  return {
    top: container.top + minY - pinPadTop,
    left: container.left + minX - padX,
    width: Math.max(48, maxX - minX + padX * 2),
    height: Math.max(48, maxY - minY + pinPadTop + pinPadBottom),
  };
}

type PinMarker = { lat: number; lng: number };

/** Viewport rect tight around location pin(s) — for the clickable-pin tour step. */
export function computeLocationPinClickTourSpot(
  map: MapProject,
  ...markers: Array<PinMarker | null | undefined>
): HamMapTourSpotRect | null {
  const container = map.getContainer().getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const marker of markers) {
    if (!marker) continue;
    const point = map.project([marker.lng, marker.lat]);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX)) return null;

  const pinPad = 32;

  return {
    top: container.top + minY - pinPad,
    left: container.left + minX - pinPad,
    width: Math.max(56, maxX - minX + pinPad * 2),
    height: Math.max(56, maxY - minY + pinPad * 2),
  };
}

