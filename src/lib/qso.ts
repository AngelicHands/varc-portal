import { createHash } from "crypto";
import type { QsoListItemDto } from "@/lib/account-types";
import {
  QSO_COUNT_CACHE_TTL_SEC,
  QSO_LIST_CACHE_TTL_SEC,
  QsoCacheKeys,
  QsoCacheTags,
  qsoCacheAside,
} from "@/lib/cache/qso-cache";
import { escapeRegex } from "@/lib/callsigns-normalize";
import { connectDb } from "@/lib/db";
import {
  normalizeQsoLogbookSearch,
  parseQsoLogbookBandFilter,
  parseQsoLogbookModeFilter,
  parseQsoLogbookPageSize,
  parseQsoLogbookSortDir,
  parseQsoLogbookSortKey,
  parseQsoLogbookSourceFilter,
  parseQsoLogbookStatusFilter,
  type QsoLogbookPageResult,
  type QsoLogbookSortDir,
  type QsoLogbookSortKey,
  type QsoLogbookStatusFilter,
} from "@/lib/qso-logbook-query";
import { normalizeQsoSource } from "@/lib/qso-source";
import { QsoLog } from "@/models/QsoLog";
import { User } from "@/models/User";

export type {
  QsoLogbookPageResult,
  QsoLogbookPageSize,
  QsoLogbookSortDir,
  QsoLogbookSortKey,
} from "@/lib/qso-logbook-query";
export {
  QSO_LOGBOOK_DEFAULT_PAGE_SIZE,
  QSO_LOGBOOK_PAGE_SIZES,
  QSO_LOGBOOK_SORT_KEYS,
  normalizeQsoLogbookSearch,
  parseQsoLogbookPageSize,
  parseQsoLogbookSortDir,
  parseQsoLogbookSortKey,
} from "@/lib/qso-logbook-query";

type QsoDocLike = {
  _id: unknown;
  workedCallsign: string;
  workedName?: string;
  qsoAt: Date;
  band: string;
  freqMhz?: number | null;
  mode: string;
  rstSent?: string;
  rstRcvd?: string;
  qso_sent?: boolean;
  qso_confirmed?: boolean;
  source?: string;
  grid?: string;
  notes?: string;
};

export function toQsoListItemDto(doc: QsoDocLike): QsoListItemDto {
  return {
    id: String(doc._id),
    workedCallsign: doc.workedCallsign,
    workedName: doc.workedName?.trim() ?? "",
    qsoAt: doc.qsoAt.toISOString(),
    band: doc.band,
    freqMhz: doc.freqMhz ?? null,
    mode: doc.mode,
    rstSent: doc.rstSent ?? "59",
    rstRcvd: doc.rstRcvd ?? "59",
    qso_sent: doc.qso_sent ?? false,
    qso_confirmed: doc.qso_confirmed ?? false,
    source: normalizeQsoSource(doc.source, "portal"),
    grid: doc.grid ?? "",
    notes: doc.notes ?? "",
  };
}

/** Attach portal account display names when stored ADIF/import name is empty. */
export async function withWorkedNames(
  qsos: QsoListItemDto[],
): Promise<QsoListItemDto[]> {
  if (qsos.length === 0) return qsos;

  const missing = qsos.filter((qso) => !qso.workedName.trim());
  if (missing.length === 0) return qsos;

  const callsigns = [
    ...new Set(
      missing
        .map((qso) => qso.workedCallsign.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (callsigns.length === 0) return qsos;

  await connectDb();
  const users = await User.find({ callsign: { $in: callsigns } })
    .select("callsign name")
    .lean<Array<{ callsign: string; name?: string }>>();

  const nameByCallsign = new Map(
    users.map((user) => [
      user.callsign.trim().toUpperCase(),
      user.name?.trim() ?? "",
    ]),
  );

  return qsos.map((qso) => {
    if (qso.workedName.trim()) return qso;
    return {
      ...qso,
      workedName:
        nameByCallsign.get(qso.workedCallsign.trim().toUpperCase()) || "",
    };
  });
}

export async function lookupWorkedName(callsign: string): Promise<string> {
  const normalized = callsign.trim().toUpperCase();
  if (!normalized) return "";
  await connectDb();
  const user = await User.findOne({ callsign: normalized })
    .select("name")
    .lean<{ name?: string } | null>();
  return user?.name?.trim() ?? "";
}

export async function listUserQsos(
  userId: string,
  limit?: number,
): Promise<QsoListItemDto[]> {
  return qsoCacheAside(
    QsoCacheKeys.qsoList(userId, limit),
    [QsoCacheTags.user(userId)],
    async () => {
      await connectDb();
      let query = QsoLog.find({ userId }).sort({ qsoAt: -1 });
      if (limit != null && limit > 0) {
        query = query.limit(limit);
      }
      const docs = await query.lean();
      return withWorkedNames(docs.map((doc) => toQsoListItemDto(doc)));
    },
    QSO_LIST_CACHE_TTL_SEC,
  );
}

function pageQueryHash(
  search: string,
  page: number,
  pageSize: number,
  sortKey: QsoLogbookSortKey,
  sortDir: QsoLogbookSortDir,
  band: string,
  mode: string,
  status: QsoLogbookStatusFilter,
  source: string,
): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        search,
        page,
        pageSize,
        sortKey,
        sortDir,
        band,
        mode,
        status,
        source,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function buildQsoSearchFilter(
  userId: string,
  filters: {
    search: string;
    band: string;
    mode: string;
    status: QsoLogbookStatusFilter;
    source: string;
  },
) {
  const base: Record<string, unknown> = { userId };

  if (filters.band) base.band = filters.band;
  if (filters.mode) base.mode = filters.mode;
  if (filters.source) base.source = filters.source;

  if (filters.status === "confirmed") {
    base.qso_confirmed = true;
  } else if (filters.status === "sent") {
    base.qso_confirmed = { $ne: true };
    base.qso_sent = true;
  } else if (filters.status === "pending") {
    base.qso_confirmed = { $ne: true };
    base.qso_sent = { $ne: true };
  }

  if (!filters.search) return base;

  const escaped = escapeRegex(filters.search);
  const regex = new RegExp(escaped, "i");
  return {
    ...base,
    $or: [
      { workedCallsign: regex },
      { workedName: regex },
      { mode: regex },
      { band: regex },
      { grid: regex },
      { notes: regex },
    ],
  };
}

function mongoSort(
  sortKey: QsoLogbookSortKey,
  sortDir: QsoLogbookSortDir,
): Record<string, 1 | -1> {
  const dir = sortDir === "asc" ? 1 : -1;
  if (sortKey === "qsoAt") {
    return { qsoAt: dir, _id: dir };
  }
  return { [sortKey]: dir, qsoAt: -1, _id: -1 };
}

export async function listUserQsosPage(params: {
  userId: string;
  page?: string | number;
  pageSize?: string | number;
  search?: string;
  band?: string;
  mode?: string;
  status?: string;
  source?: string;
  sortKey?: string;
  sortDir?: string;
}): Promise<QsoLogbookPageResult> {
  const search = normalizeQsoLogbookSearch(params.search);
  const band = parseQsoLogbookBandFilter(params.band);
  const mode = parseQsoLogbookModeFilter(params.mode);
  const status = parseQsoLogbookStatusFilter(params.status);
  const source = parseQsoLogbookSourceFilter(params.source);
  const pageSize = parseQsoLogbookPageSize(params.pageSize);
  const sortKey = parseQsoLogbookSortKey(params.sortKey);
  const sortDir = parseQsoLogbookSortDir(params.sortDir, sortKey);
  const pageHintRaw =
    typeof params.page === "number"
      ? params.page
      : Number.parseInt(String(params.page ?? "1"), 10);
  const pageHint =
    Number.isFinite(pageHintRaw) && pageHintRaw > 0
      ? Math.floor(pageHintRaw)
      : 1;

  const queryHash = pageQueryHash(
    search,
    pageHint,
    pageSize,
    sortKey,
    sortDir,
    band,
    mode,
    status,
    source,
  );

  return qsoCacheAside(
    QsoCacheKeys.qsoListPage(
      params.userId,
      pageHint,
      pageSize,
      queryHash,
      sortKey,
      sortDir,
    ),
    [QsoCacheTags.user(params.userId)],
    async () => {
      await connectDb();
      const filter = buildQsoSearchFilter(params.userId, {
        search,
        band,
        mode,
        status,
        source,
      });
      const total = await QsoLog.countDocuments(filter);
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
      const page =
        totalPages === 0
          ? 1
          : Math.min(pageHint, Math.max(1, totalPages));

      const docs = await QsoLog.find(filter)
        .sort(mongoSort(sortKey, sortDir))
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();

      return {
        items: await withWorkedNames(docs.map((doc) => toQsoListItemDto(doc))),
        total,
        totalPages,
        page,
        pageSize,
        search,
        band,
        mode,
        status,
        source,
        sortKey,
        sortDir,
      };
    },
    QSO_LIST_CACHE_TTL_SEC,
  );
}

export async function countUserQsos(userId: string) {
  return qsoCacheAside(
    QsoCacheKeys.qsoCount(userId),
    [QsoCacheTags.user(userId)],
    async () => {
      await connectDb();
      return QsoLog.countDocuments({ userId });
    },
    QSO_COUNT_CACHE_TTL_SEC,
  );
}

export async function requireUserCallsign(userId: string) {
  await connectDb();
  const user = await User.findById(userId).select("callsign").lean();
  const callsign = user?.callsign?.trim() ?? "";
  if (!callsign) {
    return { ok: false as const, error: "Set your callsign in Account before logging QSOs" };
  }
  return { ok: true as const, callsign };
}

export async function listQsosForExport(userId?: string) {
  await connectDb();
  const filter = userId ? { userId } : {};
  return QsoLog.find(filter).sort({ qsoAt: 1 }).lean();
}
