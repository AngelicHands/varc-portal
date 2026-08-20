"use server";

import mongoose from "mongoose";
import { auth } from "@/auth";
import { parseAdifFile } from "@/lib/adif/parse";
import {
  mapAdifRecordToQsoInput,
  qsoDuplicateKey,
  qsoDuplicateKeyFromDoc,
} from "@/lib/adif/import";
import { connectDb } from "@/lib/db";
import { requireUserCallsign } from "@/lib/qso";
import { revalidateLogbook } from "@/lib/qso-revalidate";
import { failAction } from "@/lib/safe-error";
import type { AdifImportValues } from "@/lib/adif/import";
import { QsoLog } from "@/models/QsoLog";

const MAX_ERROR_LINES = 8;

function isAdifFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".adi") || lower.endsWith(".adif");
}

export async function importQsoAdifAction(formData: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { ok: false as const, error: "Unauthorized" };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, error: "Choose an ADIF file (.adi or .adif)" };
    }
    if (!isAdifFilename(file.name)) {
      return {
        ok: false as const,
        error: "Upload an ADIF file with a .adi or .adif extension",
      };
    }

    await connectDb();
    const callsignCheck = await requireUserCallsign(session.user.id);
    if (!callsignCheck.ok) return callsignCheck;

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseAdifFile(buffer);

    let skippedInvalid = 0;
    let skippedStationMismatch = 0;
    const errors: string[] = [];
    const candidates: AdifImportValues[] = [];

    for (const [index, record] of parsed.records.entries()) {
      const mapped = mapAdifRecordToQsoInput(record, callsignCheck.callsign);
      if (!mapped.ok) {
        if (mapped.skip === "station_mismatch") {
          skippedStationMismatch += 1;
        } else {
          skippedInvalid += 1;
          if (errors.length < MAX_ERROR_LINES) {
            errors.push(`Record ${index + 1}: ${mapped.reason}`);
          }
        }
        continue;
      }
      candidates.push(mapped.value);
    }

    if (candidates.length === 0) {
      return {
        ok: false as const,
        error: "No valid QSO records found in this ADIF file",
        skippedInvalid,
        skippedStationMismatch,
        errors,
      };
    }

    const times = candidates.map((item) => new Date(item.qsoAt).getTime());
    const minAt = new Date(Math.min(...times));
    const maxAt = new Date(Math.max(...times));

    const existing = await QsoLog.find({
      userId: session.user.id,
      qsoAt: { $gte: minAt, $lte: maxAt },
    })
      .select("workedCallsign qsoAt band mode")
      .lean();

    const existingKeys = new Set(
      existing.map((doc) => qsoDuplicateKeyFromDoc(doc)),
    );

    const toInsert: AdifImportValues[] = [];
    let skippedDuplicate = 0;

    for (const item of candidates) {
      const key = qsoDuplicateKey(item);
      if (existingKeys.has(key)) {
        skippedDuplicate += 1;
        continue;
      }
      existingKeys.add(key);
      toInsert.push(item);
    }

    if (toInsert.length > 0) {
      await QsoLog.insertMany(
        toInsert.map((item) => ({
          userId: new mongoose.Types.ObjectId(session.user.id),
          workedCallsign: item.workedCallsign,
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
        })),
      );
    }

    revalidateLogbook(callsignCheck.callsign);

    return {
      ok: true as const,
      imported: toInsert.length,
      skippedDuplicate,
      skippedInvalid,
      skippedStationMismatch,
      errors,
    };
  } catch (error) {
    return failAction(error, "Failed to import ADIF");
  }
}
