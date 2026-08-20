import type { QsoListItemDto } from "@/lib/account-types";

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

export type QsoLogbookPageResult = {
  items: QsoListItemDto[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: QsoLogbookPageSize;
  search: string;
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
