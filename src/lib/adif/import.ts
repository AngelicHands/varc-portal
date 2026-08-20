import type { AdifRecord } from "@/lib/adif/parse";
import {
  QSO_BANDS,
  isValidCallsign,
  normalizeProfileCallsign,
  qsoInputSchema,
  type QsoBand,
  type QsoInputValues,
} from "@/lib/validations/qso";

export type AdifImportValues = QsoInputValues & {
  qso_confirmed: boolean;
  confirmedAt: string | null;
};

export type AdifMapResult =
  | { ok: true; value: AdifImportValues }
  | { ok: false; reason: string };

export type AdifSkipReason =
  | "invalid"
  | "station_mismatch";

function field(record: AdifRecord, ...names: string[]): string {
  for (const name of names) {
    const value = record[name.toLowerCase()];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function normalizeBand(raw: string): QsoBand {
  const band = raw.trim().toLowerCase();
  if ((QSO_BANDS as readonly string[]).includes(band)) {
    return band as QsoBand;
  }
  return "other";
}

function parseAdifDateTime(qsoDate: string, timeOn: string): string | null {
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

function parseAdifDateOnly(raw: string): string | null {
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

/** QRZ Logbook: APP_QRZLOG_STATUS C = confirmed/complete contact. */
export function adifQsoConfirmed(record: AdifRecord): boolean {
  return field(record, "app_qrzlog_status").toUpperCase() === "C";
}

function adifConfirmedAt(record: AdifRecord): string | null {
  if (!adifQsoConfirmed(record)) return null;
  const qsldate = field(record, "app_qrzlog_qsldate");
  if (qsldate) {
    return parseAdifDateOnly(qsldate);
  }
  return null;
}

export function adifStationCallsign(record: AdifRecord): string {
  return normalizeProfileCallsign(field(record, "station_callsign"));
}

export function mapAdifRecordToQsoInput(
  record: AdifRecord,
  userCallsign: string,
): AdifMapResult & { skip?: AdifSkipReason } {
  if (!record || Object.keys(record).length === 0) {
    return { ok: false, reason: "Empty record" };
  }

  const recordStation = adifStationCallsign(record);
  if (recordStation && recordStation !== userCallsign) {
    return {
      ok: false,
      reason: `Station callsign ${recordStation} does not match your callsign`,
      skip: "station_mismatch",
    };
  }

  const workedCallsign = normalizeProfileCallsign(field(record, "call"));
  if (!workedCallsign || !isValidCallsign(workedCallsign)) {
    return { ok: false, reason: "Missing or invalid CALL" };
  }

  const qsoDate = field(record, "qso_date");
  const timeOn = field(record, "time_on");
  const qsoAt = parseAdifDateTime(qsoDate, timeOn);
  if (!qsoAt) {
    return { ok: false, reason: "Missing or invalid QSO_DATE / TIME_ON" };
  }

  const band = normalizeBand(field(record, "band"));
  const freqRaw = field(record, "freq");
  const mode = field(record, "mode").toUpperCase() || "OTHER";
  const rstSent = field(record, "rst_sent") || "59";
  const rstRcvd = field(record, "rst_rcvd") || "59";
  const grid = field(record, "gridsquare", "grid").toUpperCase();
  const notes = field(record, "comment", "notes");

  const candidate = {
    workedCallsign,
    qsoAt,
    band,
    freqMhz: freqRaw,
    mode,
    rstSent,
    rstRcvd,
    qso_sent: false,
    grid,
    notes,
  };

  const parsed = qsoInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Record failed validation";
    return { ok: false, reason: message };
  }

  return {
    ok: true,
    value: {
      ...parsed.data,
      qso_confirmed: adifQsoConfirmed(record),
      confirmedAt: adifConfirmedAt(record),
    },
  };
}

export function qsoDuplicateKey(values: QsoInputValues): string {
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
