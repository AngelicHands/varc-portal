export type AdifImportErrorKey =
  | "emptyRecord"
  | "invalidCall"
  | "invalidQsoDateTime"
  | "invalidCallsign"
  | "invalidFrequency"
  | "recordValidationFailed"
  | "stationMismatch"
  | "noRecordsInFile"
  | "noValidRecordsInFile"
  | "allDuplicates"
  | "invalidExtension"
  | "parseFailed"
  | "fileTooLarge"
  | "tooManyRecords"
  | "noValidRecordsInUpload"
  | "chooseFile"
  | "importFailed"
  | "unauthorized"
  | "callsignRequired";

export type AdifImportErrorParams = {
  stationCallsign?: string;
  detail?: string;
};

export type AdifImportErrorRef = {
  key: AdifImportErrorKey;
  params?: AdifImportErrorParams;
};

export function adifImportError(
  key: AdifImportErrorKey,
  params?: AdifImportErrorParams,
): AdifImportErrorRef {
  return params ? { key, params } : { key };
}

export function parseErrorToImportError(error: unknown): AdifImportErrorRef {
  if (!(error instanceof Error)) {
    return adifImportError("parseFailed");
  }
  const message = error.message;
  if (message.includes("exceeds") && message.includes("records")) {
    return adifImportError("tooManyRecords");
  }
  if (message.includes("exceeds") && message.includes("MB")) {
    return adifImportError("fileTooLarge");
  }
  return adifImportError("parseFailed", { detail: message });
}
