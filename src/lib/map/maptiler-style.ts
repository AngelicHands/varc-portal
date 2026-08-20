export type HamMapTheme = "light" | "dark";

const MAPTILER_MAP_IDS: Record<HamMapTheme, string> = {
  dark: "darkmatter",
  light: "positron",
};

export function mapTilerStyleUrl(theme: HamMapTheme, apiKey: string): string {
  const mapId = MAPTILER_MAP_IDS[theme];
  return `https://api.maptiler.com/maps/${mapId}/style.json?key=${encodeURIComponent(apiKey)}`;
}

export function readMapTilerApiKey(): string {
  return process.env.NEXT_PUBLIC_MAPTILER_API_KEY?.trim() ?? "";
}

export const HAM_MAP_THEME_STORAGE_KEY = "ham-map-theme";
export const HAM_MAP_THEME_EVENT = "ham-map-theme";
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export function defaultHamMapTheme(): HamMapTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function readStoredHamMapTheme(): HamMapTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(HAM_MAP_THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return defaultHamMapTheme();
}

export function writeStoredHamMapTheme(theme: HamMapTheme) {
  window.localStorage.setItem(HAM_MAP_THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event(HAM_MAP_THEME_EVENT));
}
