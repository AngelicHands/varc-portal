export const QSO_SOURCES = ["portal", "api", "qrz", "eqsl", "adif"] as const;

export type QsoSource = (typeof QSO_SOURCES)[number];

export function isQsoSource(value: unknown): value is QsoSource {
  return (
    typeof value === "string" &&
    (QSO_SOURCES as readonly string[]).includes(value)
  );
}

export function normalizeQsoSource(value: unknown, fallback: QsoSource = "portal"): QsoSource {
  if (isQsoSource(value)) return value;
  return fallback;
}

export function qsoSourceLabel(source: QsoSource): string {
  if (source === "portal") return "Portal";
  if (source === "api") return "API";
  if (source === "qrz") return "QRZ";
  if (source === "eqsl") return "eQSL";
  return "ADIF";
}
