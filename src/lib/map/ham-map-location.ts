export const HAM_MAP_LOCATION_GRID_KEY = "ham-map-location-grid";
export const HAM_MAP_LOCATION_ALLOWED_KEY = "ham-map-location-allowed";
export const HAM_MAP_LOCATION_COORDS_KEY = "ham-map-location-coords";
export const HAM_MAP_PROFILE_UPDATE_SKIP_KEY = "ham-map-profile-update-skip";
export const HAM_MAP_LOCATION_EVENT = "ham-map-location";

export type StoredHamMapCoords = {
  lat: number;
  lng: number;
};

export function readStoredHamMapGrid(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(HAM_MAP_LOCATION_GRID_KEY)?.trim().toUpperCase() ?? "";
}

let cachedCoordsRaw: string | null = null;
let cachedCoords: StoredHamMapCoords | null = null;

export function readStoredHamMapCoords(): StoredHamMapCoords | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(HAM_MAP_LOCATION_COORDS_KEY);
  if (!raw) {
    cachedCoordsRaw = null;
    cachedCoords = null;
    return null;
  }
  if (raw === cachedCoordsRaw) return cachedCoords;
  cachedCoordsRaw = raw;
  try {
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    if (
      typeof parsed.lat === "number" &&
      Number.isFinite(parsed.lat) &&
      typeof parsed.lng === "number" &&
      Number.isFinite(parsed.lng)
    ) {
      cachedCoords = { lat: parsed.lat, lng: parsed.lng };
      return cachedCoords;
    }
  } catch {
    cachedCoords = null;
    return null;
  }
  cachedCoords = null;
  return null;
}

export function hasAllowedHamMapLocation(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(HAM_MAP_LOCATION_ALLOWED_KEY) === "1" ||
    Boolean(readStoredHamMapGrid())
  );
}

export function readSkippedProfileUpdateGrid(): string {
  if (typeof window === "undefined") return "";
  return (
    window.localStorage
      .getItem(HAM_MAP_PROFILE_UPDATE_SKIP_KEY)
      ?.trim()
      .toUpperCase() ?? ""
  );
}

export function skipProfileLocationUpdate(grid: string) {
  if (typeof window === "undefined") return;
  const normalized = grid.trim().toUpperCase();
  if (normalized) {
    window.localStorage.setItem(HAM_MAP_PROFILE_UPDATE_SKIP_KEY, normalized);
  }
  window.dispatchEvent(new Event(HAM_MAP_LOCATION_EVENT));
}

export function getServerSkippedProfileUpdateGrid() {
  return "";
}

export function persistHamMapLocation(
  grid: string,
  lat?: number,
  lng?: number,
) {
  if (typeof window === "undefined") return;
  const normalized = grid.trim().toUpperCase();
  window.localStorage.setItem(HAM_MAP_LOCATION_ALLOWED_KEY, "1");
  if (normalized) {
    window.localStorage.setItem(HAM_MAP_LOCATION_GRID_KEY, normalized);
  }
  if (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng)
  ) {
    window.localStorage.setItem(
      HAM_MAP_LOCATION_COORDS_KEY,
      JSON.stringify({ lat, lng }),
    );
  }
  window.dispatchEvent(new Event(HAM_MAP_LOCATION_EVENT));
}

export function getServerStoredGrid() {
  return "";
}

export function getServerStoredCoords(): StoredHamMapCoords | null {
  return null;
}

export function getServerLocationAllowed() {
  return true;
}

export function subscribeHamMapLocation(onStoreChange: () => void) {
  window.addEventListener(HAM_MAP_LOCATION_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(HAM_MAP_LOCATION_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}
