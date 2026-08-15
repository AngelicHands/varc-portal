import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { CmsCacheTags, invalidateCmsTags } from "@/lib/cache/cms-cache";
import { escapeRegex, foldSearchText } from "@/lib/callsigns-normalize";
import {
  extractCallsigns,
  licenseStatusFromExpiry,
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
  permitRaw: string;
  permitType: string;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string;
  status: "valid" | "expired" | "unknown";
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

export async function rebuildCallsignSummary(sign: string) {
  const licenses = await CallsignLicense.find({ callsigns: sign })
    .sort({ issuedAt: -1, stt: -1 })
    .lean();
  if (licenses.length === 0) {
    await Callsign.deleteOne({ sign });
    return;
  }

  const latest = licenses[0];
  const names = new Set<string>();
  const permits = new Set<string>();
  const operatorIds = new Set<string>();
  for (const row of licenses) {
    const folded = foldSearchText(row.operatorName);
    if (folded) names.add(folded);
    if (row.permitNumber) permits.add(row.permitNumber);
    if (row.operatorId) operatorIds.add(String(row.operatorId));
  }

  const prefix = parseCallsignPrefix(sign);
  const callsignDoc = await Callsign.findOne({ sign });
  const payload = {
    sign,
    prefixFamily: prefix.prefixFamily,
    areaDigit: prefix.areaDigit,
    operatorIds: [...operatorIds].map((id) => new mongoose.Types.ObjectId(id)),
    latestLicenseId: latest._id,
    eventCount: licenses.length,
    searchNames: [...names],
    searchPermits: [...permits],
    latestOperatorName: latest.operatorName,
    latestIssuedAt: latest.issuedAt,
    latestExpiresAt: latest.expiresAt,
    latestPermitRaw: latest.permitRaw,
    latestStatus: licenseStatusFromExpiry(dayIso(latest.expiresAt)),
  };

  if (callsignDoc) {
    await Callsign.updateOne({ sign }, { $set: payload });
  } else {
    await Callsign.create(payload);
  }
}

async function refreshCallsignsCache() {
  await invalidateCmsTags(CmsCacheTags.callsigns);
}

export async function listAdminCallsigns(query = "") {
  await connectDb();
  const q = query.trim();
  const filter = q
    ? {
        $or: [
          { sign: new RegExp(`^${escapeRegex(q.toUpperCase())}`) },
          { searchNames: new RegExp(escapeRegex(foldSearchText(q))) },
          { latestOperatorName: new RegExp(escapeRegex(q), "i") },
        ],
      }
    : {};
  const docs = await Callsign.find(filter)
    .sort({ sign: 1 })
    .limit(500)
    .lean<CallsignDocument[]>();
  return docs.map((doc) => ({
    sign: doc.sign,
    operatorName: doc.latestOperatorName,
    permitRaw: doc.latestPermitRaw,
    issuedAt: dayIso(doc.latestIssuedAt),
    expiresAt: dayIso(doc.latestExpiresAt),
    status: licenseStatusFromExpiry(dayIso(doc.latestExpiresAt)),
    eventCount: doc.eventCount,
  }));
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

  return {
    sign: doc.sign,
    operatorName: operator?.displayName || doc.latestOperatorName,
    operatorKind: (operator?.kind as AdminCallsignRecord["operatorKind"]) || "person",
    latestIssuedAt: dayIso(doc.latestIssuedAt),
    latestExpiresAt: dayIso(doc.latestExpiresAt),
    latestPermitRaw: doc.latestPermitRaw,
    latestStatus: licenseStatusFromExpiry(dayIso(doc.latestExpiresAt)),
    eventCount: doc.eventCount,
    licenses: licenses.map((row) => ({
      id: String(row._id),
      permitRaw: row.permitRaw,
      permitType: row.permitType,
      issuedAt: dayIso(row.issuedAt),
      expiresAt: dayIso(row.expiresAt),
      notes: row.notes,
      status: licenseStatusFromExpiry(dayIso(row.expiresAt)),
    })),
  };
}

export async function createAdminCallsign(input: AdminCallsignInput) {
  await connectDb();
  const sign = extractCallsigns(input.sign)[0] || input.sign.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sign) throw new Error("Callsign is required");
  const existing = await Callsign.findOne({ sign });
  if (existing) throw new Error(`Callsign ${sign} already exists`);
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
    const permit = parsePermit(license.permitRaw);
    await CallsignLicense.create({
      importKey: "manual",
      stt: stt,
      operatorId: operator._id,
      operatorName,
      callsignIds: [callsign._id],
      callsignRaw: sign,
      callsigns: [sign],
      permitRaw: license.permitRaw.trim(),
      permitNumber: permit.permitNumber,
      permitType: coercePermitType(license.permitType, permit.permitType),
      renewalIndex: permit.renewalIndex,
      issuedAt: dateFromDay(license.issuedAt),
      expiresAt: dateFromDay(license.expiresAt),
      status: licenseStatusFromExpiry(license.expiresAt),
      notes: license.notes.trim(),
      flags: [],
    });
    stt += 1;
  }

  await rebuildCallsignSummary(sign);
  await refreshCallsignsCache();
  return { sign };
}

export async function updateAdminCallsign(
  originalSign: string,
  input: AdminCallsignInput,
) {
  await connectDb();
  const sign = originalSign.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const doc = await Callsign.findOne({ sign });
  if (!doc) throw new Error("Callsign not found");
  const operatorName = input.operatorName.trim();
  if (!operatorName) throw new Error("Operator name is required");
  if (!input.licenses.length) throw new Error("Keep at least one license event");

  const operator = await upsertOperator(operatorName, input.operatorKind);
  const existingLicenses = await CallsignLicense.find({ callsigns: sign });
  const keptIds = new Set(
    input.licenses.map((row) => row.id).filter((id): id is string => Boolean(id)),
  );

  for (const row of existingLicenses) {
    if (!keptIds.has(String(row._id))) {
      await CallsignLicense.deleteOne({ _id: row._id });
    }
  }

  let stt = await nextStt();
  for (const license of input.licenses) {
    const permit = parsePermit(license.permitRaw);
    const payload = {
      operatorId: operator._id,
      operatorName,
      callsignIds: [doc._id],
      callsignRaw: sign,
      callsigns: [sign],
      permitRaw: license.permitRaw.trim(),
      permitNumber: permit.permitNumber,
      permitType: coercePermitType(license.permitType, permit.permitType),
      renewalIndex: permit.renewalIndex,
      issuedAt: dateFromDay(license.issuedAt),
      expiresAt: dateFromDay(license.expiresAt),
      status: licenseStatusFromExpiry(license.expiresAt),
      notes: license.notes.trim(),
    };
    if (license.id) {
      await CallsignLicense.updateOne({ _id: license.id }, { $set: payload });
    } else {
      await CallsignLicense.create({
        importKey: "manual",
        stt,
        flags: [],
        ...payload,
      });
      stt += 1;
    }
  }

  await rebuildCallsignSummary(sign);
  await refreshCallsignsCache();
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
  await refreshCallsignsCache();
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
