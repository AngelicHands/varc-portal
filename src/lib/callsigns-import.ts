import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { CmsCacheTags, invalidateCmsTags } from "@/lib/cache/cms-cache";
import {
  foldSearchText,
  issuedRank,
  parseCallsignPrefix,
  type ImportPayload,
} from "@/lib/callsigns-parse";
import { Callsign } from "@/models/Callsign";
import { CallsignImport } from "@/models/CallsignImport";
import { CallsignLicense } from "@/models/CallsignLicense";
import { CallsignOperator } from "@/models/CallsignOperator";

export type CallsignImportResult = {
  importKey: string;
  events: number;
  callsigns: number;
  operators: number;
  replaced: boolean;
};

function dateFromIsoDay(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function importCallsignPayload(
  payload: ImportPayload,
  options?: { replace?: boolean },
): Promise<CallsignImportResult> {
  await connectDb();
  const replace = Boolean(options?.replace);

  const existing = await CallsignImport.findOne({ key: payload.importKey });
  if (existing && !replace) {
    throw new Error(
      "This spreadsheet was already imported. Tick “Replace existing directory” to load it again.",
    );
  }

  if (!replace) {
    const existingCount = await Callsign.countDocuments();
    if (existingCount > 0) {
      throw new Error(
        "The directory already has callsigns. Tick “Replace existing directory” to overwrite, or add records individually.",
      );
    }
  }

  if (replace) {
    await Promise.all([
      CallsignLicense.deleteMany({}),
      Callsign.deleteMany({}),
      CallsignOperator.deleteMany({}),
      CallsignImport.deleteMany({}),
    ]);
  }

  const operators = new Map<
    string,
    {
      key: string;
      displayName: string;
      nameNormalized: string;
      aliases: Set<string>;
      kind: ImportPayload["events"][number]["operatorKind"];
      latestIssued: number;
    }
  >();

  for (const event of payload.events) {
    const key = event.operatorKey || `unknown:stt-${event.stt}`;
    const name = event.name.trim();
    const usableName = name && name !== '"' ? name : `Unknown #${event.stt}`;
    const rank = issuedRank(event);
    const current = operators.get(key);
    if (!current) {
      operators.set(key, {
        key,
        displayName: usableName,
        nameNormalized: foldSearchText(usableName),
        aliases: new Set(
          usableName === `Unknown #${event.stt}` ? [] : [usableName],
        ),
        kind: event.operatorKind || "unknown",
        latestIssued: rank,
      });
      continue;
    }
    if (usableName !== `Unknown #${event.stt}`) current.aliases.add(usableName);
    if (rank >= current.latestIssued) {
      current.displayName = usableName;
      current.nameNormalized = foldSearchText(usableName);
      current.latestIssued = rank;
    }
  }

  const operatorDocs = await CallsignOperator.insertMany(
    [...operators.values()].map((op) => ({
      key: op.key,
      displayName: op.displayName,
      nameNormalized: op.nameNormalized,
      aliases: [...op.aliases],
      kind: op.kind,
    })),
  );
  const operatorIdByKey = new Map(
    operatorDocs.map((doc) => [doc.key, doc._id] as const),
  );

  const bySign = new Map<string, ImportPayload["events"]>();
  for (const event of payload.events) {
    for (const sign of event.callsigns) {
      const list = bySign.get(sign) ?? [];
      list.push(event);
      bySign.set(sign, list);
    }
  }

  const callsignDocs = await Callsign.insertMany(
    [...bySign.entries()].map(([sign, events]) => {
      const prefix = parseCallsignPrefix(sign);
      const latest = [...events].sort((a, b) => {
        const byDate = issuedRank(b) - issuedRank(a);
        return byDate !== 0 ? byDate : b.stt - a.stt;
      })[0];
      const names = new Set<string>();
      const permits = new Set<string>();
      const operatorKeys = new Set<string>();
      for (const event of events) {
        const folded = foldSearchText(event.name);
        if (folded) names.add(folded);
        if (event.permitNumber) permits.add(event.permitNumber);
        operatorKeys.add(event.operatorKey || `unknown:stt-${event.stt}`);
      }
      return {
        sign,
        prefixFamily: prefix.prefixFamily,
        areaDigit: prefix.areaDigit,
        operatorIds: [...operatorKeys]
          .map((key) => operatorIdByKey.get(key))
          .filter((id): id is mongoose.Types.ObjectId => Boolean(id)),
        latestLicenseId: null,
        eventCount: events.length,
        searchNames: [...names],
        searchPermits: [...permits],
        latestOperatorName: latest?.name || "",
        latestIssuedAt: dateFromIsoDay(latest?.issuedAt ?? null),
        latestExpiresAt: dateFromIsoDay(latest?.expiresAt ?? null),
        latestPermitRaw: latest?.permitRaw || "",
        latestStatus: latest?.status ?? "unknown",
      };
    }),
  );
  const callsignIdBySign = new Map(
    callsignDocs.map((doc) => [doc.sign, doc._id] as const),
  );

  const licenses = await CallsignLicense.insertMany(
    payload.events.map((event) => {
      const key = event.operatorKey || `unknown:stt-${event.stt}`;
      const operatorId = operatorIdByKey.get(key);
      if (!operatorId) {
        throw new Error(`Missing operator for STT ${event.stt}`);
      }
      return {
        importKey: payload.importKey,
        stt: event.stt,
        operatorId,
        operatorName: event.name,
        callsignIds: event.callsigns
          .map((sign) => callsignIdBySign.get(sign))
          .filter((id): id is mongoose.Types.ObjectId => Boolean(id)),
        callsignRaw: event.callsignRaw,
        callsigns: event.callsigns,
        permitRaw: event.permitRaw,
        permitNumber: event.permitNumber,
        permitType: event.permitType,
        renewalIndex: event.renewalIndex,
        issuedAt: dateFromIsoDay(event.issuedAt),
        expiresAt: dateFromIsoDay(event.expiresAt),
        status: event.status,
        notes: event.notes,
        flags: event.flags,
      };
    }),
  );

  const latestLicenseIdBySign = new Map<string, mongoose.Types.ObjectId>();
  for (const license of licenses) {
    for (const sign of license.callsigns) {
      const currentId = latestLicenseIdBySign.get(sign);
      if (!currentId) {
        latestLicenseIdBySign.set(sign, license._id);
        continue;
      }
      const current = licenses.find((row) => row._id.equals(currentId));
      const currentTime = current?.issuedAt?.getTime() ?? -1;
      const nextTime = license.issuedAt?.getTime() ?? -1;
      if (
        nextTime > currentTime ||
        (nextTime === currentTime && license.stt > (current?.stt ?? 0))
      ) {
        latestLicenseIdBySign.set(sign, license._id);
      }
    }
  }

  const latestOps = [...latestLicenseIdBySign.entries()].map(
    ([sign, licenseId]) => ({
      updateOne: {
        filter: { sign },
        update: { $set: { latestLicenseId: licenseId } },
      },
    }),
  );
  if (latestOps.length > 0) {
    await Callsign.bulkWrite(latestOps);
  }

  await CallsignImport.create({
    key: payload.importKey,
    sourceFile: payload.sourceFile,
    sourceCreated: payload.sourceCreated,
    rowCount: payload.rowCount,
    operatorCount: operatorDocs.length,
    callsignCount: callsignDocs.length,
    importedAt: new Date(),
  });

  await invalidateCmsTags(CmsCacheTags.callsigns);

  return {
    importKey: payload.importKey,
    events: licenses.length,
    callsigns: callsignDocs.length,
    operators: operatorDocs.length,
    replaced: replace,
  };
}
