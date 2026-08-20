import type { AdifRecord } from "@/lib/adif/parse";
import {
  isQsoSource,
  type QsoSource,
} from "@/lib/qso-source";

function headerValue(header: AdifRecord, name: string): string {
  return header[name.toLowerCase()]?.trim() ?? "";
}

/** Detect ADIF origin from the file header (PROGRAMID, etc.). */
export function detectAdifImportSource(header: AdifRecord): QsoSource {
  const programId = headerValue(header, "programid").toLowerCase();
  if (programId.includes("qrz")) return "qrz";
  if (programId.includes("eqsl")) return "eqsl";
  if (programId.includes("varc")) return "portal";
  return "adif";
}

/** Prefer per-record APP_VARC_SOURCE when re-importing VARC exports. */
export function resolveAdifRecordSource(
  fileSource: QsoSource,
  record: AdifRecord,
): QsoSource {
  const tagged = record.app_varc_source?.trim().toLowerCase() ?? "";
  if (isQsoSource(tagged)) return tagged;
  return fileSource;
}
