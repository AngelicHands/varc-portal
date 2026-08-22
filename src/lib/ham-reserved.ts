import { normalizeCallsignQuery } from "@/lib/callsigns-normalize";

/** First path segments that must never be used as a ham callsign URL. */
export const RESERVED_HAM_PATHS = new Set([
  "ADMIN",
  "API",
  "MEDIA",
  "ACCOUNT",
  "CALLSIGNS",
  "CATEGORIES",
  "LOGBOOK",
  "NEWS",
  "PAGES",
  "QSO",
  "QTH",
  "VI",
  "EN",
  "ROBOTS",
  "SITEMAP",
  "FAVICON",
  "MAPLIBRE",
  "_NEXT",
]);

const BARE_CALLSIGN_PATH = /^\/([A-Za-z0-9]{3,15})$/;

export function isReservedHamPath(value: string): boolean {
  return RESERVED_HAM_PATHS.has(value.trim().toUpperCase());
}

/** Unprefixed /XV1ABC — returns uppercase sign, or null if not a ham path. */
export function parseBareCallsignPath(pathname: string): string | null {
  const match = BARE_CALLSIGN_PATH.exec(pathname);
  if (!match) return null;
  const sign = match[1].toUpperCase();
  if (isReservedHamPath(sign)) return null;
  return sign;
}

/** Public profile path without locale prefix (e.g. XV1ABC → /XV1ABC). */
export function hamPublicPath(sign: string): string {
  return `/${normalizeCallsignQuery(sign)}`;
}

/** QSO map deep link for a callsign (e.g. /qso?callsign=XV1ABC). */
export function qsoMapCallsignHref(sign: string): string {
  const callsign = normalizeCallsignQuery(sign);
  if (!callsign) return "/qso";
  return `/qso?callsign=${encodeURIComponent(callsign)}`;
}

/** Valid ham URL segment, or null (punctuation / reserved / invalid). Case may still differ. */
export function parseHamPathParam(raw: string): string | null {
  const sign = normalizeCallsignQuery(raw);
  if (!sign || isReservedHamPath(sign) || sign.length < 3 || sign.length > 15) {
    return null;
  }
  if (raw.toUpperCase() !== sign) return null;
  return sign;
}

export type HamTabId =
  | "profile"
  | "logbook"
  | "documents"
  | "qsl"
  | "privacy"
  | "security";

export function parseHamTab(
  raw: string | undefined,
  visibleTabs: readonly HamTabId[],
): HamTabId {
  if (raw && visibleTabs.includes(raw as HamTabId)) {
    return raw as HamTabId;
  }
  return visibleTabs[0] ?? "profile";
}
