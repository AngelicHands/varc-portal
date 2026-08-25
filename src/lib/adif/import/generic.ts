import type { AdifRecord } from "@/lib/adif/parse";
import type { QsoSource } from "@/lib/qso-source";
import {
  adifField,
  adifNotesFromRecord,
  adifQsoAtFromRecord,
  adifStationCallsign,
  adifWorkedNameFromRecord,
  normalizeAdifBand,
  normalizeAdifCallsign,
  normalizeAdifFreq,
  parseAdifDateOnly,
  validateImportedCandidate,
  type AdifMapResult,
  type AdifSkipReason,
} from "@/lib/adif/import/shared";
import { adifImportError } from "@/lib/adif/import/error-keys";
import { isValidCallsign } from "@/lib/validations/qso";

function genericQsoConfirmed(record: AdifRecord): boolean {
  if (adifField(record, "app_qrzlog_status").toUpperCase() === "C") {
    return true;
  }
  return adifField(record, "qsl_rcvd").toUpperCase() === "Y";
}

function genericConfirmedAt(record: AdifRecord): string | null {
  if (!genericQsoConfirmed(record)) return null;
  const qsldate = adifField(record, "app_qrzlog_qsldate", "qslrdate");
  if (qsldate) {
    return parseAdifDateOnly(qsldate);
  }
  return null;
}

export function mapGenericAdifRecord(
  record: AdifRecord,
  userCallsign: string,
  source: QsoSource = "adif",
): AdifMapResult & { skip?: AdifSkipReason } {
  if (!record || Object.keys(record).length === 0) {
    return { ok: false, reason: adifImportError("emptyRecord") };
  }

  const recordStation = adifStationCallsign(record);
  if (recordStation && recordStation !== userCallsign) {
    return {
      ok: false,
      reason: adifImportError("stationMismatch", {
        stationCallsign: recordStation,
      }),
      skip: "station_mismatch",
    };
  }

  const workedCallsign = normalizeAdifCallsign(adifField(record, "call"));
  if (!workedCallsign || !isValidCallsign(workedCallsign)) {
    return { ok: false, reason: adifImportError("invalidCall") };
  }

  const qsoAt = adifQsoAtFromRecord(record);
  if (!qsoAt) {
    return { ok: false, reason: adifImportError("invalidQsoDateTime") };
  }

  return validateImportedCandidate(
    {
      workedCallsign,
      qsoAt,
      band: normalizeAdifBand(adifField(record, "band")),
      freqMhz:
        normalizeAdifFreq(adifField(record, "freq")) ||
        normalizeAdifFreq(adifField(record, "freq_rx")),
      mode: adifField(record, "mode").toUpperCase() || "OTHER",
      rstSent: adifField(record, "rst_sent") || "59",
      rstRcvd: adifField(record, "rst_rcvd") || "59",
      qso_sent: false,
      grid: adifField(record, "gridsquare", "grid").toUpperCase(),
      notes: adifNotesFromRecord(record),
      workedName: adifWorkedNameFromRecord(record),
    },
    source,
    {
      qso_confirmed: genericQsoConfirmed(record),
      confirmedAt: genericConfirmedAt(record),
    },
  );
}
