import type { useTranslations } from "next-intl";
import type { AdifImportErrorRef } from "@/lib/adif/import/error-keys";

type LogbookTranslator = ReturnType<typeof useTranslations<"logbook">>;

export function translateAdifImportError(
  t: LogbookTranslator,
  error: AdifImportErrorRef,
): string {
  const params = error.params;
  if (error.key === "parseFailed" && params?.detail) {
    return t("importErrors.parseFailedDetail", { detail: params.detail });
  }
  if (error.key === "stationMismatch" && params?.stationCallsign) {
    return t("importErrors.stationMismatch", {
      stationCallsign: params.stationCallsign,
    });
  }
  return t(`importErrors.${error.key}`);
}
