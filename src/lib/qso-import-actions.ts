"use server";

import mongoose from "mongoose";
import { auth } from "@/auth";
import { parseAdifFile } from "@/lib/adif/parse";
import {
  detectAdifImportSource,
  mapAdifRecordToQsoInput,
  qsoDuplicateKey,
  qsoDuplicateKeyFromDoc,
} from "@/lib/adif/import";
import {
  adifImportError,
  parseErrorToImportError,
  type AdifImportErrorRef,
} from "@/lib/adif/import/error-keys";
import { invalidateQsoAndHamCache } from "@/lib/cache/qso-cache";
import { connectDb } from "@/lib/db";
import { requireUserCallsign } from "@/lib/qso";
import { revalidateLogbook } from "@/lib/qso-revalidate";
import { failAction } from "@/lib/safe-error";
import type { AdifImportValues } from "@/lib/adif/import";
import { QsoLog } from "@/models/QsoLog";

const MAX_RECORD_ERRORS = 50;

export type AdifImportFailedFile = {
  name: string;
  reason: AdifImportErrorRef;
};

export type AdifImportRecordError = {
  fileName: string;
  recordLine: number;
  reason: AdifImportErrorRef;
};

type CandidateWithFile = AdifImportValues & {
  fileName: string;
};

type ExistingQsoDoc = {
  _id: mongoose.Types.ObjectId;
  workedCallsign: string;
  qsoAt: Date;
  band: string;
  mode: string;
  freqMhz?: number | null;
  rstSent?: string;
  rstRcvd?: string;
  grid?: string;
  notes?: string;
  workedName?: string;
  source?: string;
  qso_confirmed?: boolean;
  confirmedAt?: Date | null;
};

function isAdifFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".adi") || lower.endsWith(".adif");
}

function importFailureReason(params: {
  recordCount: number;
  validCount: number;
}): AdifImportErrorRef | null {
  if (params.recordCount === 0) {
    return adifImportError("noRecordsInFile");
  }
  if (params.validCount === 0) {
    return adifImportError("noValidRecordsInFile");
  }
  return null;
}

/** Prefer non-empty ADIF values; keep existing when the import field is blank. */
function mergeImportedFields(
  existing: ExistingQsoDoc,
  incoming: AdifImportValues,
): Record<string, unknown> {
  const $set: Record<string, unknown> = {};

  const nextFreq =
    incoming.freqMhz != null && Number.isFinite(incoming.freqMhz)
      ? incoming.freqMhz
      : existing.freqMhz ?? null;
  if (nextFreq !== (existing.freqMhz ?? null)) {
    $set.freqMhz = nextFreq;
  }

  if (incoming.rstSent && incoming.rstSent !== (existing.rstSent ?? "")) {
    $set.rstSent = incoming.rstSent;
  }
  if (incoming.rstRcvd && incoming.rstRcvd !== (existing.rstRcvd ?? "")) {
    $set.rstRcvd = incoming.rstRcvd;
  }
  if (incoming.grid && incoming.grid !== (existing.grid ?? "")) {
    $set.grid = incoming.grid;
  }
  if (incoming.notes && incoming.notes !== (existing.notes ?? "")) {
    $set.notes = incoming.notes;
  }
  if (
    incoming.workedName &&
    incoming.workedName !== (existing.workedName ?? "")
  ) {
    $set.workedName = incoming.workedName;
  }
  if (incoming.source && incoming.source !== existing.source) {
    $set.source = incoming.source;
  }

  const nextConfirmed = Boolean(existing.qso_confirmed) || incoming.qso_confirmed;
  if (nextConfirmed !== Boolean(existing.qso_confirmed)) {
    $set.qso_confirmed = nextConfirmed;
  }

  const nextConfirmedAt =
    existing.confirmedAt ??
    (incoming.confirmedAt ? new Date(incoming.confirmedAt) : null);
  const existingAtMs = existing.confirmedAt?.getTime() ?? null;
  const nextAtMs = nextConfirmedAt?.getTime() ?? null;
  if (nextAtMs !== existingAtMs) {
    $set.confirmedAt = nextConfirmedAt;
  }

  return $set;
}

export async function importQsoAdifAction(formData: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        ok: false as const,
        error: adifImportError("unauthorized"),
        failedFiles: [] as AdifImportFailedFile[],
        recordErrors: [] as AdifImportRecordError[],
        truncatedRecordErrors: 0,
      };
    }

    const files = formData
      .getAll("file")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      return {
        ok: false as const,
        error: adifImportError("chooseFile"),
        failedFiles: [],
        recordErrors: [],
        truncatedRecordErrors: 0,
      };
    }

    await connectDb();
    const callsignCheck = await requireUserCallsign(session.user.id);
    if (!callsignCheck.ok) {
      return {
        ok: false as const,
        error: adifImportError("callsignRequired"),
        failedFiles: [],
        recordErrors: [],
        truncatedRecordErrors: 0,
      };
    }

    let skippedInvalid = 0;
    let skippedStationMismatch = 0;
    const recordErrors: AdifImportRecordError[] = [];
    let truncatedRecordErrors = 0;
    const candidates: CandidateWithFile[] = [];
    const detectedSources = new Set<string>();
    const failedFiles: AdifImportFailedFile[] = [];
    const fileStats = new Map<
      string,
      {
        recordCount: number;
        validCount: number;
        importedCount: number;
        updatedCount: number;
      }
    >();

    for (const file of files) {
      if (!isAdifFilename(file.name)) {
        failedFiles.push({
          name: file.name,
          reason: adifImportError("invalidExtension"),
        });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = parseAdifFile(buffer);
        const fileSource = detectAdifImportSource(parsed.header);
        detectedSources.add(fileSource);

        let validCount = 0;
        for (const [index, record] of parsed.records.entries()) {
          const mapped = mapAdifRecordToQsoInput(
            record,
            callsignCheck.callsign,
            fileSource,
          );
          if (!mapped.ok) {
            if (mapped.skip === "station_mismatch") {
              skippedStationMismatch += 1;
            } else {
              skippedInvalid += 1;
            }
            if (recordErrors.length < MAX_RECORD_ERRORS) {
              recordErrors.push({
                fileName: file.name,
                recordLine: index + 1,
                reason: mapped.reason,
              });
            } else {
              truncatedRecordErrors += 1;
            }
            continue;
          }
          validCount += 1;
          candidates.push({ ...mapped.value, fileName: file.name });
        }

        fileStats.set(file.name, {
          recordCount: parsed.records.length,
          validCount,
          importedCount: 0,
          updatedCount: 0,
        });
      } catch (error) {
        failedFiles.push({
          name: file.name,
          reason: parseErrorToImportError(error),
        });
      }
    }

    if (candidates.length === 0) {
      for (const [name, stats] of fileStats.entries()) {
        if (failedFiles.some((item) => item.name === name)) continue;
        const reason = importFailureReason({
          recordCount: stats.recordCount,
          validCount: stats.validCount,
        });
        if (reason) {
          failedFiles.push({ name, reason });
        }
      }

      return {
        ok: false as const,
        error: adifImportError("noValidRecordsInUpload"),
        skippedInvalid,
        skippedStationMismatch,
        recordErrors,
        truncatedRecordErrors,
        failedFiles,
      };
    }

    // Last occurrence wins within the upload batch (re-import refresh).
    const latestByKey = new Map<string, CandidateWithFile>();
    for (const item of candidates) {
      latestByKey.set(qsoDuplicateKey(item), item);
    }

    const times = [...latestByKey.values()].map((item) =>
      new Date(item.qsoAt).getTime(),
    );
    const minAt = new Date(Math.min(...times));
    const maxAt = new Date(Math.max(...times));

    const existing = await QsoLog.find({
      userId: session.user.id,
      qsoAt: { $gte: minAt, $lte: maxAt },
    })
      .select(
        "workedCallsign qsoAt band mode freqMhz rstSent rstRcvd grid notes workedName source qso_confirmed confirmedAt",
      )
      .lean<ExistingQsoDoc[]>();

    const existingByKey = new Map(
      existing.map((doc) => [qsoDuplicateKeyFromDoc(doc), doc] as const),
    );

    const toInsert: CandidateWithFile[] = [];
    const bulkOps: mongoose.AnyBulkWriteOperation[] = [];
    let updated = 0;
    let unchanged = 0;

    for (const [key, item] of latestByKey.entries()) {
      const existingDoc = existingByKey.get(key);
      if (!existingDoc) {
        toInsert.push(item);
        continue;
      }

      const $set = mergeImportedFields(existingDoc, item);
      if (Object.keys($set).length === 0) {
        unchanged += 1;
        continue;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: existingDoc._id, userId: session.user.id },
          update: { $set },
        },
      });
      updated += 1;
      const stats = fileStats.get(item.fileName);
      if (stats) {
        stats.updatedCount += 1;
      }
    }

    for (const item of toInsert) {
      const stats = fileStats.get(item.fileName);
      if (stats) {
        stats.importedCount += 1;
      }
    }

    for (const [name, stats] of fileStats.entries()) {
      if (failedFiles.some((item) => item.name === name)) continue;
      const reason = importFailureReason(stats);
      if (reason) {
        failedFiles.push({ name, reason });
      }
    }

    if (toInsert.length > 0) {
      await QsoLog.insertMany(
        toInsert.map((item) => ({
          userId: new mongoose.Types.ObjectId(session.user.id),
          workedCallsign: item.workedCallsign,
          workedName: item.workedName || "",
          qsoAt: new Date(item.qsoAt),
          band: item.band,
          freqMhz: item.freqMhz,
          mode: item.mode,
          rstSent: item.rstSent,
          rstRcvd: item.rstRcvd,
          qso_sent: false,
          qso_confirmed: item.qso_confirmed,
          confirmedAt: item.confirmedAt ? new Date(item.confirmedAt) : null,
          grid: item.grid,
          notes: item.notes,
          source: item.source,
        })),
      );
    }

    if (bulkOps.length > 0) {
      await QsoLog.bulkWrite(bulkOps, { ordered: false });
    }

    revalidateLogbook(callsignCheck.callsign);
    await invalidateQsoAndHamCache({
      userId: session.user.id,
      callsigns: [callsignCheck.callsign],
    });

    return {
      ok: true as const,
      imported: toInsert.length,
      updated,
      unchanged,
      files: files.length,
      source:
        detectedSources.size === 1 ? [...detectedSources][0] : "adif",
      skippedDuplicate: unchanged,
      skippedInvalid,
      skippedStationMismatch,
      recordErrors,
      truncatedRecordErrors,
      failedFiles,
    };
  } catch (error) {
    failAction(error, "Failed to import ADIF");
    return {
      ok: false as const,
      error: adifImportError("importFailed"),
      failedFiles: [],
      recordErrors: [],
      truncatedRecordErrors: 0,
    };
  }
}
