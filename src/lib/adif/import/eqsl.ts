import type { AdifRecord } from "@/lib/adif/parse";
import type { QsoSource } from "@/lib/qso-source";
import {
  adifField,
  normalizeAdifBand,
  normalizeAdifCallsign,
  normalizeAdifFreq,
  parseAdifDateTime,
  validateImportedCandidate,
  type AdifMapResult,
  type AdifSkipReason,
} from "@/lib/adif/import/shared";
import { adifImportError } from "@/lib/adif/import/error-keys";
import { isValidCallsign } from "@/lib/validations/qso";

export function mapEqslAdifRecord(
  record: AdifRecord,
  _userCallsign: string,
  source: QsoSource = "eqsl",
): AdifMapResult & { skip?: AdifSkipReason } {
  if (!record || Object.keys(record).length === 0) {
    return { ok: false, reason: adifImportError("emptyRecord") };
  }

  const workedCallsign = normalizeAdifCallsign(adifField(record, "call"));
  if (!workedCallsign || !isValidCallsign(workedCallsign)) {
    return { ok: false, reason: adifImportError("invalidCall") };
  }

  const qsoDate = adifField(record, "qso_date");
  const timeOn = adifField(record, "time_on");
  const qsoAt = parseAdifDateTime(qsoDate, timeOn);
  if (!qsoAt) {
    return { ok: false, reason: adifImportError("invalidQsoDateTime") };
  }

  const notes = [adifField(record, "qslmsg"), adifField(record, "comment", "notes")]
    .filter(Boolean)
    .join(" · ");

  return validateImportedCandidate(
    {
      workedCallsign,
      qsoAt,
      band: normalizeAdifBand(adifField(record, "band")),
      freqMhz: normalizeAdifFreq(adifField(record, "freq")),
      mode: adifField(record, "mode").toUpperCase() || "OTHER",
      rstSent: adifField(record, "rst_sent") || "59",
      rstRcvd: adifField(record, "rst_rcvd") || "59",
      qso_sent: false,
      grid: adifField(record, "gridsquare", "grid").toUpperCase(),
      notes,
    },
    source,
    {
      qso_confirmed: false,
      confirmedAt: null,
    },
  );
}
