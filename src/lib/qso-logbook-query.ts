import type { QsoListItemDto } from "@/lib/account-types";
import { QSO_SOURCES, type QsoSource } from "@/lib/qso-source";
import { QSO_BANDS, QSO_MODES, type QsoBand } from "@/lib/validations/qso";

export const QSO_LOGBOOK_PAGE_SIZES = [20, 50, 100] as const;
export type QsoLogbookPageSize = (typeof QSO_LOGBOOK_PAGE_SIZES)[number];
export const QSO_LOGBOOK_DEFAULT_PAGE_SIZE: QsoLogbookPageSize = 20;

export const QSO_LOGBOOK_SORT_KEYS = [
  "qsoAt",
  "workedCallsign",
  "band",
  "mode",
  "grid",
] as const;
export type QsoLogbookSortKey = (typeof QSO_LOGBOOK_SORT_KEYS)[number];
export type QsoLogbookSortDir = "asc" | "desc";

export const QSO_LOGBOOK_STATUS_FILTERS = [
  "all",
  "confirmed",
  "sent",
  "pending",
] as const;
export type QsoLogbookStatusFilter =
  (typeof QSO_LOGBOOK_STATUS_FILTERS)[number];

export type QsoLogbookFilters = {
  search: string;
  band: string;
  mode: string;
  status: QsoLogbookStatusFilter;
  source: string;
};

export type QsoLogbookPageResult = {
  items: QsoListItemDto[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: QsoLogbookPageSize;
  search: string;
  band: string;
  mode: string;
  status: QsoLogbookStatusFilter;
  source: string;
  sortKey: QsoLogbookSortKey;
  sortDir: QsoLogbookSortDir;
};

export function normalizeQsoLogbookSearch(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0, 80);
}

export function parseQsoLogbookPageSize(
  raw: string | number | undefined,
): QsoLogbookPageSize {
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if ((QSO_LOGBOOK_PAGE_SIZES as readonly number[]).includes(n)) {
    return n as QsoLogbookPageSize;
  }
  return QSO_LOGBOOK_DEFAULT_PAGE_SIZE;
}

export function parseQsoLogbookSortKey(
  raw: string | undefined,
): QsoLogbookSortKey {
  if (raw && (QSO_LOGBOOK_SORT_KEYS as readonly string[]).includes(raw)) {
    return raw as QsoLogbookSortKey;
  }
  return "qsoAt";
}

export function parseQsoLogbookSortDir(
  raw: string | undefined,
  sortKey: QsoLogbookSortKey = "qsoAt",
): QsoLogbookSortDir {
  if (raw === "asc" || raw === "desc") return raw;
  return sortKey === "qsoAt" ? "desc" : "asc";
}

export function parseQsoLogbookBandFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  if ((QSO_BANDS as readonly string[]).includes(value)) {
    return value as QsoBand;
  }
  return "";
}

export function parseQsoLogbookModeFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim().toUpperCase();
  if (!value) return "";
  if ((QSO_MODES as readonly string[]).includes(value)) return value;
  // Allow modes imported from ADIF that are outside the curated list.
  if (/^[A-Z0-9/+-]{1,16}$/.test(value)) return value;
  return "";
}

export function parseQsoLogbookStatusFilter(
  raw: string | undefined,
): QsoLogbookStatusFilter {
  if (
    raw &&
    (QSO_LOGBOOK_STATUS_FILTERS as readonly string[]).includes(raw)
  ) {
    return raw as QsoLogbookStatusFilter;
  }
  return "all";
}

export function parseQsoLogbookSourceFilter(raw: string | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  if ((QSO_SOURCES as readonly string[]).includes(value)) {
    return value as QsoSource;
  }
  return "";
}

export function hasQsoLogbookFilters(filters: QsoLogbookFilters): boolean {
  return Boolean(
    filters.search ||
      filters.band ||
      filters.mode ||
      filters.source ||
      filters.status !== "all",
  );
}
