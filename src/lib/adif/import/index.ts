import type { AdifRecord } from "@/lib/adif/parse";
import { resolveAdifRecordSource } from "@/lib/adif/source";
import type { QsoSource } from "@/lib/qso-source";
import { mapEqslAdifRecord } from "@/lib/adif/import/eqsl";
import { mapGenericAdifRecord } from "@/lib/adif/import/generic";
import { mapQrzAdifRecord } from "@/lib/adif/import/qrz";
import type {
  AdifMapResult,
  AdifSkipReason,
} from "@/lib/adif/import/shared";

export type {
  AdifImportValues,
  AdifMapResult,
  AdifSkipReason,
} from "@/lib/adif/import/shared";
export {
  adifQsoConfirmed,
  qsoDuplicateKey,
  qsoDuplicateKeyFromDoc,
} from "@/lib/adif/import/shared";
export { detectAdifImportSource } from "@/lib/adif/source";

function mapBySource(
  record: AdifRecord,
  userCallsign: string,
  source: QsoSource,
): AdifMapResult & { skip?: AdifSkipReason } {
  if (source === "qrz") {
    return mapQrzAdifRecord(record, userCallsign, source);
  }
  if (source === "eqsl") {
    return mapEqslAdifRecord(record, userCallsign, source);
  }
  return mapGenericAdifRecord(record, userCallsign, source);
}

export function mapAdifRecordToQsoInput(
  record: AdifRecord,
  userCallsign: string,
  fileSource: QsoSource,
): AdifMapResult & { skip?: AdifSkipReason } {
  const source = resolveAdifRecordSource(fileSource, record);
  return mapBySource(record, userCallsign, source);
}
