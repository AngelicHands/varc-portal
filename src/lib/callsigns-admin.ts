import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { CmsCacheTags, invalidateCmsTags } from "@/lib/cache/cms-cache";
import { escapeRegex, foldSearchText } from "@/lib/callsigns-normalize";
import {
  type OperatorKindFilter,
  type PermitTypeFilter,
} from "@/lib/callsigns-filters";
import {
  dayBeforeIso,
  extractCallsigns,
  licenseHasValidDates,
  licenseStatusForRole,
  licenseStatusFromExpiry,
  operatorKindFromName,
  operatorKeyFromName,
  parseCallsignPrefix,
  parsePermit,
  type PermitType,
} from "@/lib/callsigns-parse";
import { Callsign, type CallsignDocument } from "@/models/Callsign";
import { CallsignImport } from "@/models/CallsignImport";
import { CallsignLicense } from "@/models/CallsignLicense";
import { CallsignOperator } from "@/models/CallsignOperator";

export type AdminLicenseInput = {
  id?: string;
  operatorName: string;
  permitRaw: string;
  permitType?: string;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string;
};

export type AdminCallsignInput = {
  sign: string;
  operatorName: string;
  operatorKind: "person" | "org";
  licenses: AdminLicenseInput[];
};

export type AdminLicenseRow = {
  id: string;
  operatorName: string;
  permitRaw: string;
  permitType: string;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string;
  status: "valid" | "expired" | "unknown";
  /** True when this is the callsign's single active/current permit. */
  active: boolean;
};

export type AdminCallsignRecord = {
  sign: string;
  operatorName: string;
  operatorKind: "person" | "org" | "unknown";
  latestIssuedAt: string | null;
  latestExpiresAt: string | null;
  latestPermitRaw: string;
  latestStatus: "valid" | "expired" | "unknown";
  eventCount: number;
  licenses: AdminLicenseRow[];
};

function dayIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dateFromDay(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function coercePermitType(
  value: string | undefined,
  fallback: PermitType,
): PermitType {
  if (
    value === "GP" ||
    value === "GH" ||
    value === "VARC" ||
    value === "unknown" ||
    value === "missing"
  ) {
    return value;
  }
  return fallback;
}

async function nextStt(): Promise<number> {
  const last = await CallsignLicense.findOne({})
    .sort({ stt: -1 })
    .select("stt")
    .lean<{ stt: number } | null>();
  return (last?.stt ?? 0) + 1;
}

async function upsertOperator(name: string, kind: "person" | "org") {
  const key =
    operatorKeyFromName(name) ||
    `person:${foldSearchText(name) || "unknown"}`;
  const nameNormalized = foldSearchText(name);
  const existing = await CallsignOperator.findOne({ key });
  if (existing) {
    if (name && !existing.aliases.includes(name)) {
      existing.aliases.push(name);
    }
    existing.displayName = name;
    existing.nameNormalized = nameNormalized;
    existing.kind = kind;
    await existing.save();
    return existing;
  }
  return CallsignOperator.create({
    key,
    displayName: name,
    nameNormalized,
    aliases: name ? [name] : [],
    kind,
  });
}

function compareLicenseRecency(
  a: { issuedAt?: Date | null; stt?: number },
  b: { issuedAt?: Date | null; stt?: number },
): number {
  const aTime = a.issuedAt?.getTime() ?? -1;
  const bTime = b.issuedAt?.getTime() ?? -1;
  if (aTime !== bTime) return bTime - aTime;
  return (b.stt ?? 0) - (a.stt ?? 0);
}

function licenseExpiresOnOrAfterToday(
  expiresAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  return licenseStatusFromExpiry(dayIso(expiresAt), now) === "valid";
}

/**
 * Prefer a dated, not-yet-expired permit as the current/latest event.
 * If every dated event is expired, fall back to the most recent dated event
 * (history only — it will not be marked Active).
 */
function pickLatestLicense<
  T extends {
    issuedAt?: Date | null;
    expiresAt?: Date | null;
    stt?: number;
  },
>(licenses: T[], now = new Date()): T {
  const dated = licenses.filter((row) =>
    licenseHasValidDates(dayIso(row.issuedAt), dayIso(row.expiresAt)),
  );
  const current = dated.filter((row) =>
    licenseExpiresOnOrAfterToday(row.expiresAt, now),
  );
  if (current.length > 0) {
    return [...current].sort(compareLicenseRecency)[0];
  }
  if (dated.length > 0) {
    return [...dated].sort(compareLicenseRecency)[0];
  }
  return [...licenses].sort(compareLicenseRecency)[0];
}

function isActiveLicenseEvent(
  licenseId: string,
  latestId: string | null,
  expiresAt: string | null,
  now = new Date(),
): boolean {
  if (!latestId || licenseId !== latestId) return false;
  return licenseStatusFromExpiry(expiresAt, now) === "valid";
}

export async function rebuildCallsignSummary(sign: string) {
  const licenses = await CallsignLicense.find({ callsigns: sign }).lean();
  if (licenses.length === 0) {
    await Callsign.deleteOne({ sign });
    return;
  }

  const latest = pickLatestLicense(licenses);
  const latestIssued = dayIso(latest.issuedAt);
  const latestIsCurrent = licenseExpiresOnOrAfterToday(latest.expiresAt);

  for (const row of licenses) {
    const isLatest = row._id.equals(latest._id);
    let expiresIso = dayIso(row.expiresAt);
    const issuedIso = dayIso(row.issuedAt);
    const patch: Record<string, unknown> = {};

    // Close out overlapping past permits only when the chosen latest is still current.
    if (
      latestIsCurrent &&
      !isLatest &&
      latestIssued &&
      expiresIso &&
      expiresIso >= latestIssued
    ) {
      const closed = dayBeforeIso(latestIssued);
      if (!issuedIso || closed >= issuedIso) {
        expiresIso = closed;
        patch.expiresAt = dateFromDay(closed);
      }
    }

    const status = licenseStatusForRole(expiresIso, isLatest && latestIsCurrent);
    if (row.status !== status) patch.status = status;
    if (Object.keys(patch).length > 0) {
      await CallsignLicense.updateOne({ _id: row._id }, { $set: patch });
    }
  }

  const refreshed = await CallsignLicense.find({ callsigns: sign })
    .sort({ issuedAt: -1, stt: -1 })
    .lean();
  const latestFresh =
    refreshed.find((row) => row._id.equals(latest._id)) ?? refreshed[0];

  const names = new Set<string>();
  const permits = new Set<string>();
  const operatorIds: mongoose.Types.ObjectId[] = [];
  const seenOperators = new Set<string>();
  if (latestFresh.operatorId) {
    const id = String(latestFresh.operatorId);
    seenOperators.add(id);
    operatorIds.push(latestFresh.operatorId);
  }
  for (const row of refreshed) {
    const folded = foldSearchText(row.operatorName);
    if (folded) names.add(folded);
    if (row.permitNumber) permits.add(row.permitNumber);
    if (row.operatorId) {
      const id = String(row.operatorId);
      if (!seenOperators.has(id)) {
        seenOperators.add(id);
        operatorIds.push(row.operatorId);
      }
    }
  }

  const prefix = parseCallsignPrefix(sign);
  const callsignDoc = await Callsign.findOne({ sign });
  const payload = {
    sign,
    prefixFamily: prefix.prefixFamily,
    areaDigit: prefix.areaDigit,
    operatorIds,
    latestLicenseId: latestFresh._id,
    eventCount: refreshed.length,
    searchNames: [...names],
    searchPermits: [...permits],
    latestOperatorName: latestFresh.operatorName,
    latestIssuedAt: latestFresh.issuedAt,
    latestExpiresAt: latestFresh.expiresAt,
    latestPermitRaw: latestFresh.permitRaw,
    latestStatus: licenseStatusForRole(
      dayIso(latestFresh.expiresAt),
      true,
    ),
  };

  if (callsignDoc) {
    await Callsign.updateOne({ sign }, { $set: payload });
  } else {
    await Callsign.create(payload);
  }
}

async function refreshCallsignsCache(sign?: string) {
  const tags: string[] = [CmsCacheTags.callsigns];
  if (sign) tags.push(CmsCacheTags.callsign(sign.toUpperCase()));
  await invalidateCmsTags(...tags);
}

export type CallsignListFilters = {
  q?: string;
  operatorKind?: OperatorKindFilter;
  permitType?: PermitTypeFilter;
  /** How Kind (permitType) matches: latest license only, or any license event. */
  permitMatch?: "latest" | "any";
  signs?: string[];
  limit?: number;
};

export type AdminCallsignListItem = {
  sign: string;
  operatorName: string;
  permitRaw: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: "valid" | "expired" | "unknown";
  eventCount: number;
  prefixFamily: "XV" | "3W" | "other";
};

async function callsignMongoFilter(filters: CallsignListFilters) {
  const conditions: Record<string, unknown>[] = [];
  const q = filters.q?.trim() ?? "";
  if (q) {
    conditions.push({
      $or: [
        { sign: new RegExp(`^${escapeRegex(q.toUpperCase())}`) },
        { searchNames: new RegExp(escapeRegex(foldSearchText(q))) },
        { latestOperatorName: new RegExp(escapeRegex(q), "i") },
      ],
    });
  }
  if (filters.operatorKind && filters.operatorKind !== "all") {
    const operators = await CallsignOperator.find({ kind: filters.operatorKind })
      .select("_id")
      .lean<{ _id: mongoose.Types.ObjectId }[]>();
    conditions.push({
      operatorIds: { $in: operators.map((operator) => operator._id) },
    });
  }
  if (filters.permitType && filters.permitType !== "all") {
    if (filters.permitMatch === "any") {
      const licenses = await CallsignLicense.find({
        permitType: filters.permitType,
      })
        .select("callsigns")
        .lean<{ callsigns?: string[] }[]>();
      const signs = [
        ...new Set(
          licenses.flatMap((license) =>
            (license.callsigns ?? []).map((sign) => String(sign).toUpperCase()),
          ),
        ),
      ];
      conditions.push({ sign: { $in: signs } });
    } else {
      const licenses = await CallsignLicense.find({
        permitType: filters.permitType,
      })
        .select("_id")
        .lean<{ _id: mongoose.Types.ObjectId }[]>();
      conditions.push({
        latestLicenseId: { $in: licenses.map((license) => license._id) },
      });
    }
  }
  if (filters.signs) {
    const signs = [
      ...new Set(
        filters.signs
          .map((sign) => sign.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .filter(Boolean),
      ),
    ];
    if (signs.length === 0) {
      conditions.push({ sign: { $in: [] } });
    } else {
      conditions.push({ sign: { $in: signs } });
    }
  }
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}

export async function queryAdminCallsigns(
  filters: CallsignListFilters = {},
): Promise<AdminCallsignListItem[]> {
  await connectDb();
  const limit = Math.max(1, Math.min(filters.limit ?? 10_000, 10_000));
  const docs = await Callsign.find(await callsignMongoFilter(filters))
    .sort({ sign: 1 })
    .limit(limit)
    .lean<CallsignDocument[]>();
  return docs.map((doc) => ({
    sign: doc.sign,
    operatorName: doc.latestOperatorName,
    permitRaw: doc.latestPermitRaw,
    issuedAt: dayIso(doc.latestIssuedAt),
    expiresAt: dayIso(doc.latestExpiresAt),
    status: licenseStatusFromExpiry(dayIso(doc.latestExpiresAt)),
    eventCount: doc.eventCount,
    prefixFamily: doc.prefixFamily,
  }));
}

export async function listAdminCallsigns(filters: CallsignListFilters = {}) {
  return queryAdminCallsigns({ ...filters, limit: filters.limit ?? 500 });
}

export async function getAdminCallsign(
  rawSign: string,
): Promise<AdminCallsignRecord | null> {
  await connectDb();
  const sign = rawSign.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sign) return null;
  const doc = await Callsign.findOne({ sign }).lean<CallsignDocument | null>();
  if (!doc) return null;

  const licenses = await CallsignLicense.find({ callsigns: sign })
    .sort({ issuedAt: -1, stt: -1 })
    .lean();
  const operator = doc.operatorIds[0]
    ? await CallsignOperator.findById(doc.operatorIds[0]).lean()
    : null;
  const latestId = doc.latestLicenseId
    ? String(doc.latestLicenseId)
    : licenses[0]
      ? String(licenses[0]._id)
      : null;

  const ordered = [...licenses].sort((a, b) => {
    const aActive = isActiveLicenseEvent(
      String(a._id),
      latestId,
      dayIso(a.expiresAt),
    )
      ? 1
      : 0;
    const bActive = isActiveLicenseEvent(
      String(b._id),
      latestId,
      dayIso(b.expiresAt),
    )
      ? 1
      : 0;
    if (aActive !== bActive) return bActive - aActive;
    return compareLicenseRecency(a, b);
  });

  return {
    sign: doc.sign,
    operatorName: operator?.displayName || doc.latestOperatorName,
    operatorKind: (operator?.kind as AdminCallsignRecord["operatorKind"]) || "person",
    latestIssuedAt: dayIso(doc.latestIssuedAt),
    latestExpiresAt: dayIso(doc.latestExpiresAt),
    latestPermitRaw: doc.latestPermitRaw,
    latestStatus: licenseStatusForRole(dayIso(doc.latestExpiresAt), true),
    eventCount: doc.eventCount,
    licenses: ordered.map((row) => {
      const expiresAt = dayIso(row.expiresAt);
      const active = isActiveLicenseEvent(String(row._id), latestId, expiresAt);
      return {
        id: String(row._id),
        operatorName: row.operatorName || "",
        permitRaw: row.permitRaw,
        permitType: row.permitType,
        issuedAt: dayIso(row.issuedAt),
        expiresAt,
        notes: row.notes,
        status:
          (row.status as AdminLicenseRow["status"]) ||
          licenseStatusForRole(expiresAt, active),
        active,
      };
    }),
  };
}

export class CallsignExistsError extends Error {
  readonly sign: string;

  constructor(sign: string) {
    super(`Callsign ${sign} already exists`);
    this.name = "CallsignExistsError";
    this.sign = sign;
  }
}

export async function createAdminCallsign(input: AdminCallsignInput) {
  await connectDb();
  const sign = extractCallsigns(input.sign)[0] || input.sign.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sign) throw new Error("Callsign is required");
  const existing = await Callsign.findOne({ sign });
  if (existing) throw new CallsignExistsError(sign);
  const operatorName = input.operatorName.trim();
  if (!operatorName) throw new Error("Operator name is required");
  if (!input.licenses.length) throw new Error("Add at least one license event");

  const operator = await upsertOperator(operatorName, input.operatorKind);
  const prefix = parseCallsignPrefix(sign);
  const callsign = await Callsign.create({
    sign,
    prefixFamily: prefix.prefixFamily,
    areaDigit: prefix.areaDigit,
    operatorIds: [operator._id],
    eventCount: 0,
    searchNames: [foldSearchText(operatorName)],
    latestOperatorName: operatorName,
  });

  let stt = await nextStt();
  for (const license of input.licenses) {
    const eventOperatorName = (license.operatorName || operatorName).trim();
    if (!eventOperatorName) throw new Error("Operator name is required");
    const eventOperator = await upsertOperator(
      eventOperatorName,
      operatorKindFromName(eventOperatorName) === "org" ? "org" : input.operatorKind,
    );
    await CallsignLicense.create({
      importKey: "manual",
      stt,
      flags: [],
      ...licenseWritePayload(license, {
        operatorId: eventOperator._id,
        operatorName: eventOperatorName,
        callsignId: callsign._id,
        sign,
      }),
    });
    stt += 1;
  }

  await rebuildCallsignSummary(sign);
  await refreshCallsignsCache(sign);
  return { sign };
}

function licenseWritePayload(
  license: AdminLicenseInput,
  ctx: {
    operatorId: mongoose.Types.ObjectId;
    operatorName: string;
    callsignId: mongoose.Types.ObjectId;
    sign: string;
  },
) {
  const permit = parsePermit(license.permitRaw);
  return {
    operatorId: ctx.operatorId,
    operatorName: ctx.operatorName,
    callsignIds: [ctx.callsignId],
    callsignRaw: ctx.sign,
    callsigns: [ctx.sign],
    permitRaw: license.permitRaw.trim(),
    permitNumber: permit.permitNumber,
    permitType: coercePermitType(license.permitType, permit.permitType),
    renewalIndex: permit.renewalIndex,
    issuedAt: dateFromDay(license.issuedAt),
    expiresAt: dateFromDay(license.expiresAt),
    status: licenseStatusFromExpiry(license.expiresAt),
    notes: license.notes.trim(),
  };
}

export async function updateAdminCallsignDetails(
  originalSign: string,
  input: Pick<AdminCallsignInput, "operatorName" | "operatorKind">,
) {
  await connectDb();
  const sign = originalSign.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const doc = await Callsign.findOne({ sign });
  if (!doc) throw new Error("Callsign not found");
  const operatorName = input.operatorName.trim();
  if (!operatorName) throw new Error("Operator name is required");

  const operator = await upsertOperator(operatorName, input.operatorKind);
  const licenses = await CallsignLicense.find({ callsigns: sign }).lean();
  if (licenses.length === 0) throw new Error("Keep at least one license event");

  const latest =
    (doc.latestLicenseId &&
      licenses.find((row) => row._id.equals(doc.latestLicenseId))) ||
    pickLatestLicense(licenses);

  await CallsignLicense.updateOne(
    { _id: latest._id },
    { $set: { operatorId: operator._id, operatorName } },
  );
  await rebuildCallsignSummary(sign);
  await refreshCallsignsCache(sign);
  return { sign };
}

export async function saveAdminCallsignLicense(
  originalSign: string,
  license: AdminLicenseInput,
) {
  await connectDb();
  const sign = originalSign.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const doc = await Callsign.findOne({ sign });
  if (!doc) throw new Error("Callsign not found");

  const operatorName = license.operatorName.trim();
  if (!operatorName) throw new Error("Operator name is required");
  const operator = await upsertOperator(
    operatorName,
    operatorKindFromName(operatorName) === "org" ? "org" : "person",
  );
  const payload = licenseWritePayload(license, {
    operatorId: operator._id,
    operatorName,
    callsignId: doc._id,
    sign,
  });

  if (license.id) {
    if (!mongoose.isValidObjectId(license.id)) {
      throw new Error("License event not found");
    }
    const updated = await CallsignLicense.updateOne(
      { _id: license.id, callsigns: sign },
      { $set: payload },
    );
    if (updated.matchedCount === 0) throw new Error("License event not found");
  } else {
    await CallsignLicense.create({
      importKey: "manual",
      stt: await nextStt(),
      flags: [],
      ...payload,
    });
  }

  await rebuildCallsignSummary(sign);
  await refreshCallsignsCache(sign);
  const record = await getAdminCallsign(sign);
  return { sign, record };
}

export async function deleteAdminCallsignLicense(
  rawSign: string,
  licenseId: string,
) {
  await connectDb();
  const sign = rawSign.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sign) throw new Error("Callsign is required");
  if (!licenseId || !mongoose.isValidObjectId(licenseId)) {
    throw new Error("License event not found");
  }

  const doc = await Callsign.findOne({ sign });
  if (!doc) throw new Error("Callsign not found");

  const licenses = await CallsignLicense.find({ callsigns: sign });
  if (licenses.length <= 1) {
    throw new Error("Keep at least one license event");
  }

  const target = licenses.find((row) => String(row._id) === licenseId);
  if (!target) throw new Error("License event not found");

  const remaining = (target.callsigns ?? []).filter((item) => item !== sign);
  if (remaining.length === 0) {
    await CallsignLicense.deleteOne({ _id: target._id });
  } else {
    target.callsigns = remaining;
    target.callsignIds = (target.callsignIds ?? []).filter(
      (id) => !id.equals(doc._id),
    );
    await target.save();
  }

  await rebuildCallsignSummary(sign);
  await refreshCallsignsCache(sign);
  return { sign };
}

export async function deleteAdminCallsign(rawSign: string) {
  await connectDb();
  const sign = rawSign.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const doc = await Callsign.findOne({ sign });
  if (!doc) throw new Error("Callsign not found");

  const licenses = await CallsignLicense.find({ callsigns: sign });
  for (const license of licenses) {
    const remaining = license.callsigns.filter((item) => item !== sign);
    if (remaining.length === 0) {
      await CallsignLicense.deleteOne({ _id: license._id });
    } else {
      license.callsigns = remaining;
      license.callsignIds = license.callsignIds.filter(
        (id) => !id.equals(doc._id),
      );
      await license.save();
    }
  }

  await Callsign.deleteOne({ sign });
  await refreshCallsignsCache(sign);
}

export async function getCallsignImportSummary() {
  await connectDb();
  const latest = await CallsignImport.findOne({}).sort({ importedAt: -1 }).lean();
  const callsigns = await Callsign.countDocuments();
  return {
    callsigns,
    lastImport: latest
      ? {
          sourceFile: latest.sourceFile,
          importedAt: latest.importedAt?.toISOString() ?? null,
          rowCount: latest.rowCount,
        }
      : null,
  };
}
