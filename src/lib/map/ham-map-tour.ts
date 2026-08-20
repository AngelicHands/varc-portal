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
  done: "ham-map-tour-help",
} as const;

/** Steps that spotlight a clamped region inside a large map surface. */
export const HAM_MAP_TOUR_CLAMPED_STEPS = new Set<HamMapTourStepId>(["pins"]);

