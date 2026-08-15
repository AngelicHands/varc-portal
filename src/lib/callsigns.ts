import { createHash } from "node:crypto";
import { connectDb } from "@/lib/db";
import {
  cacheAside,
  CmsCacheKeys,
  CmsCacheTags,
} from "@/lib/cache/cms-cache";
import {
  escapeRegex,
  foldSearchText,
  normalizeCallsignQuery,
  normalizePermitQuery,
} from "@/lib/callsigns-normalize";
import { Callsign, type CallsignDocument } from "@/models/Callsign";
import { CallsignLicense } from "@/models/CallsignLicense";

export const CALLSIGN_PAGE_SIZE = 30;
export const CALLSIGN_SEARCH_TTL_SEC = 3600;

export type CallsignListItem = {
  sign: string;
  operatorName: string;
  permitRaw: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: "valid" | "expired" | "unknown";
  eventCount: number;
  prefixFamily: "XV" | "3W" | "other";
  areaDigit: string | null;
};

export type CallsignSearchResult = {
  query: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: CallsignListItem[];
};

export type CallsignStats = {
  callsigns: number;
  operators: number;
  events: number;
  expired: number;
};

export type CallsignLicenseItem = {
  stt: number;
  operatorName: string;
  callsignRaw: string;
  callsigns: string[];
  permitRaw: string;
  permitType: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: "valid" | "expired" | "unknown";
  notes: string;
  flags: string[];
};

export type CallsignDetail = {
  sign: string;
  prefixFamily: "XV" | "3W" | "other";
  areaDigit: string | null;
  operatorName: string;
  eventCount: number;
  latestStatus: "valid" | "expired" | "unknown";
  licenses: CallsignLicenseItem[];
};

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toListItem(doc: CallsignDocument): CallsignListItem {
  return {
    sign: doc.sign,
    operatorName: doc.latestOperatorName,
    permitRaw: doc.latestPermitRaw,
    issuedAt: toIsoDate(doc.latestIssuedAt),
    expiresAt: toIsoDate(doc.latestExpiresAt),
    status: doc.latestStatus,
    eventCount: doc.eventCount,
    prefixFamily: doc.prefixFamily,
    areaDigit: doc.areaDigit ?? null,
  };
}

function searchHash(query: string, page: number, pageSize: number): string {
  return createHash("sha1")
    .update(JSON.stringify({ q: query, page, pageSize }))
    .digest("hex")
    .slice(0, 16);
}

function parsePage(raw: string | undefined, totalPages: number): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (totalPages < 1) return 1;
  return Math.min(n, totalPages);
}

export function normalizeSearchQuery(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0, 80);
}

function emptyResult(query: string): CallsignSearchResult {
  return {
    query,
    page: 1,
    pageSize: CALLSIGN_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    items: [],
  };
}

function buildFilter(query: string) {
  if (!query) return { _id: { $exists: false } };

  const signQ = normalizeCallsignQuery(query);
  const folded = foldSearchText(query);
  const permitQ = normalizePermitQuery(query);
  const clauses: Record<string, unknown>[] = [];

  if (signQ.length >= 2) {
    clauses.push({ sign: new RegExp(`^${escapeRegex(signQ)}`) });
  }
  if (folded.length >= 2) {
    clauses.push({
      searchNames: new RegExp(escapeRegex(folded)),
    });
  }
  if (permitQ.length >= 3) {
    clauses.push({ searchPermits: permitQ });
  }

  if (clauses.length === 0) {
    if (signQ) {
      return { sign: new RegExp(`^${escapeRegex(signQ)}`) };
    }
    return { _id: { $exists: false } };
  }

  return { $or: clauses };
}

export async function searchCallsigns(
  rawQuery: string | undefined,
  rawPage: string | undefined,
): Promise<CallsignSearchResult> {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return emptyResult("");

  const pageHint = Number.parseInt(rawPage ?? "1", 10);
  const safePageHint =
    Number.isFinite(pageHint) && pageHint > 0 ? Math.floor(pageHint) : 1;
  const hash = searchHash(query, safePageHint, CALLSIGN_PAGE_SIZE);

  return cacheAside(
    CmsCacheKeys.callsignSearch(hash),
    [CmsCacheTags.callsigns],
    async () => {
      await connectDb();
      const filter = buildFilter(query);
      const total = await Callsign.countDocuments(filter);
      const totalPages = Math.max(1, Math.ceil(total / CALLSIGN_PAGE_SIZE));
      const page = parsePage(String(safePageHint), total === 0 ? 1 : totalPages);
      const docs = await Callsign.find(filter)
        .sort({ sign: 1 })
        .skip((page - 1) * CALLSIGN_PAGE_SIZE)
        .limit(CALLSIGN_PAGE_SIZE)
        .lean<CallsignDocument[]>();

      return {
        query,
        page,
        pageSize: CALLSIGN_PAGE_SIZE,
        total,
        totalPages: total === 0 ? 0 : totalPages,
        items: docs.map(toListItem),
      };
    },
    { ttlSec: CALLSIGN_SEARCH_TTL_SEC },
  );
}

export async function getCallsignStats(): Promise<CallsignStats> {
  return cacheAside(
    CmsCacheKeys.callsignStats(),
    [CmsCacheTags.callsigns],
    async () => {
      await connectDb();
      const [callsigns, events, expired] = await Promise.all([
        Callsign.countDocuments(),
        CallsignLicense.countDocuments(),
        Callsign.countDocuments({ latestStatus: "expired" }),
      ]);
      const operatorIds = await Callsign.distinct("operatorIds");
      return {
        callsigns,
        operators: operatorIds.length,
        events,
        expired,
      };
    },
    { ttlSec: CALLSIGN_SEARCH_TTL_SEC },
  );
}

export async function getCallsignDetail(
  rawSign: string,
): Promise<CallsignDetail | null> {
  const sign = normalizeCallsignQuery(rawSign);
  if (!sign) return null;

  return cacheAside(
    CmsCacheKeys.callsignBySign(sign),
    [CmsCacheTags.callsigns, CmsCacheTags.callsign(sign)],
    async () => {
      await connectDb();
      const doc = await Callsign.findOne({ sign }).lean<CallsignDocument | null>();
      if (!doc) return null;

      const licenses = await CallsignLicense.find({ callsigns: sign })
        .sort({ issuedAt: -1, stt: -1 })
        .lean();

      return {
        sign: doc.sign,
        prefixFamily: doc.prefixFamily,
        areaDigit: doc.areaDigit ?? null,
        operatorName: doc.latestOperatorName,
        eventCount: doc.eventCount,
        latestStatus: doc.latestStatus,
        licenses: licenses.map((row) => ({
          stt: row.stt,
          operatorName: row.operatorName,
          callsignRaw: row.callsignRaw,
          callsigns: row.callsigns,
          permitRaw: row.permitRaw,
          permitType: row.permitType,
          issuedAt: toIsoDate(row.issuedAt),
          expiresAt: toIsoDate(row.expiresAt),
          status: row.status,
          notes: row.notes,
          flags: row.flags ?? [],
        })),
      };
    },
    { ttlSec: CALLSIGN_SEARCH_TTL_SEC },
  );
}

export async function listCallsignsForSitemap(): Promise<string[]> {
  await connectDb();
  const rows = await Callsign.find({}, { sign: 1 })
    .sort({ sign: 1 })
    .lean<{ sign: string }[]>();
  return rows.map((row) => row.sign);
}
