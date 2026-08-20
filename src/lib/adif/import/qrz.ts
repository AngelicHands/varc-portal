import type { AdifRecord } from "@/lib/adif/parse";
import type { QsoSource } from "@/lib/qso-source";
import {
  adifField,
  adifStationCallsign,
  normalizeAdifBand,
  parseAdifDateOnly,
  parseAdifDateTime,
  validateImportedCandidate,
  type AdifMapResult,
  type AdifSkipReason,
} from "@/lib/adif/import/shared";
import { isValidCallsign, normalizeProfileCallsign } from "@/lib/validations/qso";

function qrzQsoConfirmed(record: AdifRecord): boolean {
  return adifField(record, "app_qrzlog_status").toUpperCase() === "C";
}

function qrzConfirmedAt(record: AdifRecord): string | null {
  if (!qrzQsoConfirmed(record)) return null;
  const qsldate = adifField(record, "app_qrzlog_qsldate");
  if (qsldate) {
    return parseAdifDateOnly(qsldate);
  }
  return null;
}

export function mapQrzAdifRecord(
  record: AdifRecord,
  userCallsign: string,
  source: QsoSource = "qrz",
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

  const workedCallsign = normalizeProfileCallsign(adifField(record, "call"));
  if (!workedCallsign || !isValidCallsign(workedCallsign)) {
    return { ok: false, reason: "Missing or invalid CALL" };
  }

  const qsoDate = adifField(record, "qso_date");
  const timeOn = adifField(record, "time_on");
  const qsoAt = parseAdifDateTime(qsoDate, timeOn);
  if (!qsoAt) {
    return { ok: false, reason: "Missing or invalid QSO_DATE / TIME_ON" };
  }

  return validateImportedCandidate(
    {
      workedCallsign,
      qsoAt,
      band: normalizeAdifBand(adifField(record, "band")),
      freqMhz: adifField(record, "freq") || adifField(record, "freq_rx"),
      mode: adifField(record, "mode").toUpperCase() || "OTHER",
      rstSent: adifField(record, "rst_sent") || "59",
      rstRcvd: adifField(record, "rst_rcvd") || "59",
      qso_sent: false,
      grid: adifField(record, "gridsquare", "grid").toUpperCase(),
      notes: adifField(record, "comment", "notes"),
    },
    source,
    {
      qso_confirmed: qrzQsoConfirmed(record),
      confirmedAt: qrzConfirmedAt(record),
    },
  );
}
