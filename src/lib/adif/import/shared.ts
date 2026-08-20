import { z } from "zod";
import type { AdifRecord } from "@/lib/adif/parse";
import {
  FREQ_MHZ_PATTERN,
  QSO_BANDS,
  isValidCallsign,
  normalizeProfileCallsign,
  type QsoBand,
  type QsoInputValues,
} from "@/lib/validations/qso";
import type { QsoSource } from "@/lib/qso-source";
import {
  adifImportError,
  type AdifImportErrorRef,
} from "@/lib/adif/import/error-keys";

export type AdifImportValues = Omit<QsoInputValues, "freqMhz"> & {
  freqMhz: number | null;
  qso_confirmed: boolean;
  confirmedAt: string | null;
  source: QsoSource;
};

export type AdifMapResult =
  | { ok: true; value: AdifImportValues }
  | { ok: false; reason: AdifImportErrorRef };

export type AdifSkipReason = "invalid" | "station_mismatch";

export const adifQsoImportSchema = z.object({
  workedCallsign: z
    .string()
    .trim()
    .min(1)
    .max(15)
    .transform(normalizeProfileCallsign)
    .refine(isValidCallsign, { message: "Enter a valid contact callsign" }),
  qsoAt: z.string().datetime(),
  band: z.enum(QSO_BANDS),
  freqMhz: z.preprocess((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const trimmed = normalizeAdifFreq(String(value));
    if (!trimmed) return null;
    if (!FREQ_MHZ_PATTERN.test(trimmed)) return Number.NaN;
    return Number(trimmed);
  }, z.number().finite().nullable()),
  mode: z.string().trim().min(1).max(32),
  rstSent: z.string().trim().max(16),
  rstRcvd: z.string().trim().max(16),
  qso_sent: z.boolean().default(false),
  grid: z
    .string()
    .trim()
    .max(12)
    .transform((value) => value.toUpperCase()),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => value || ""),
});

/** European decimal comma in legacy JT65-HF exports (e.g. `14,076` MHz). */
export function normalizeAdifFreq(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.includes(",") && !trimmed.includes(".")) {
    return trimmed.replace(",", ".");
  }
  return trimmed;
}

/** Salvage callsigns from corrupted tags (e.g. `RU6BU<` from a broken `<CALL>` field). */
export function normalizeAdifCallsign(raw: string): string {
  const trimmed = raw.trim();
  const match = /^[A-Z0-9/-]+/i.exec(trimmed);
  return normalizeProfileCallsign(match?.[0] ?? trimmed);
}

export function adifField(record: AdifRecord, ...names: string[]): string {
  for (const name of names) {
    const value = record[name.toLowerCase()];
    if (value?.trim()) return value.trim();
  }
  return "";
}

const ADIF_NOTE_FIELD_NAMES = [
  "qslmsg",
  "comment",
  "notes",
  "qsl_rcvd_msg",
  "qsl_sent_msg",
] as const;

/** Merge ADIF message fields (QSLMSG, COMMENT, etc.) into QsoLog.notes. */
export function adifNotesFromRecord(record: AdifRecord): string {
  const parts: string[] = [];
  for (const name of ADIF_NOTE_FIELD_NAMES) {
    const value = adifField(record, name);
    if (value && !parts.includes(value)) {
      parts.push(value);
    }
  }
  return parts.join(" · ").slice(0, 2000);
}

export function normalizeAdifBand(raw: string): QsoBand {
  const band = raw.trim().toLowerCase();
  if ((QSO_BANDS as readonly string[]).includes(band)) {
    return band as QsoBand;
  }
  return "other";
}

export function parseAdifDateTime(qsoDate: string, timeOn: string): string | null {
  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(qsoDate.trim());
  if (!dateMatch) return null;

  const time = timeOn.trim();
  let hour: string;
  let minute: string;
  let second = "00";

  if (/^\d{6}$/.test(time)) {
    hour = time.slice(0, 2);
    minute = time.slice(2, 4);
    second = time.slice(4, 6);
  } else if (/^\d{4}$/.test(time)) {
    hour = time.slice(0, 2);
    minute = time.slice(2, 4);
  } else {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const h = Number(hour);
  const m = Number(minute);
  const s = Number(second);

  const date = new Date(Date.UTC(year, month - 1, day, h, m, s));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== m ||
    date.getUTCSeconds() !== s
  ) {
    return null;
  }

  return date.toISOString();
}

/**
 * QSO start time from ADIF. Prefer TIME_ON; fall back to TIME_OFF when some
 * QRZ exports omit TIME_ON.
 */
export function adifQsoAtFromRecord(record: AdifRecord): string | null {
  const qsoDate = adifField(record, "qso_date");
  if (!qsoDate) return null;
  const timeOn = adifField(record, "time_on");
  if (timeOn) {
    const fromOn = parseAdifDateTime(qsoDate, timeOn);
    if (fromOn) return fromOn;
  }
  const timeOff = adifField(record, "time_off");
  if (!timeOff) return null;
  const dateOff = adifField(record, "qso_date_off") || qsoDate;
  return parseAdifDateTime(dateOff, timeOff);
}

export function parseAdifDateOnly(raw: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

export function adifStationCallsign(record: AdifRecord): string {
  return normalizeProfileCallsign(adifField(record, "station_callsign"));
}

export function validateImportedCandidate(
  candidate: {
    workedCallsign: string;
    qsoAt: string;
    band: QsoBand;
    freqMhz: string | number | null;
    mode: string;
    rstSent: string;
    rstRcvd: string;
    qso_sent: boolean;
    grid: string;
    notes: string;
  },
  source: QsoSource,
  confirmed: { qso_confirmed: boolean; confirmedAt: string | null },
): AdifMapResult {
  const parsed = adifQsoImportSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    if (path === "workedCallsign") {
      return { ok: false, reason: adifImportError("invalidCallsign") };
    }
    if (path === "freqMhz") {
      return { ok: false, reason: adifImportError("invalidFrequency") };
    }
    return { ok: false, reason: adifImportError("recordValidationFailed") };
  }

  return {
    ok: true,
    value: {
      ...parsed.data,
      ...confirmed,
      source,
    },
  };
}

export function adifQsoConfirmed(record: AdifRecord): boolean {
  return adifField(record, "app_qrzlog_status").toUpperCase() === "C";
}

export function qsoDuplicateKey(
  values: Pick<QsoInputValues, "workedCallsign" | "qsoAt" | "band" | "mode">,
): string {
  return [
    values.workedCallsign,
    values.qsoAt,
    values.band,
    values.mode.toUpperCase(),
  ].join("|");
}

export function qsoDuplicateKeyFromDoc(doc: {
  workedCallsign: string;
  qsoAt: Date;
  band: string;
  mode: string;
}): string {
  return [
    doc.workedCallsign,
    doc.qsoAt.toISOString(),
    doc.band,
    doc.mode.toUpperCase(),
  ].join("|");
}
