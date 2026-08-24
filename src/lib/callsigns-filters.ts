export const CALLSIGN_OPERATOR_KIND_FILTERS = [
  { value: "all", label: "All operators" },
  { value: "person", label: "Person" },
  { value: "org", label: "Club / organization" },
  { value: "unknown", label: "Unknown" },
] as const;

export const CALLSIGN_PERMIT_TYPE_FILTERS = [
  { value: "all", label: "All kinds" },
  { value: "GP", label: "GP" },
  { value: "GH", label: "GH" },
  { value: "VARC", label: "VARC" },
  { value: "unknown", label: "Unknown" },
  { value: "missing", label: "Missing" },
] as const;

export type OperatorKindFilter =
  (typeof CALLSIGN_OPERATOR_KIND_FILTERS)[number]["value"];
export type PermitTypeFilter =
  (typeof CALLSIGN_PERMIT_TYPE_FILTERS)[number]["value"];

export function parseOperatorKindFilter(value: unknown): OperatorKindFilter {
  return CALLSIGN_OPERATOR_KIND_FILTERS.some((option) => option.value === value)
    ? (value as OperatorKindFilter)
    : "all";
}

export function parsePermitTypeFilter(value: unknown): PermitTypeFilter {
  return CALLSIGN_PERMIT_TYPE_FILTERS.some((option) => option.value === value)
    ? (value as PermitTypeFilter)
    : "all";
}
