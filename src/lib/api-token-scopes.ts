import { canManageCallsigns } from "@/lib/roles";

export const API_TOKEN_QSO_SCOPES = ["qso:read", "qso:write"] as const;
export const API_TOKEN_CALLSIGN_SCOPES = [
  "callsign:read",
  "callsign:write",
] as const;
export const API_TOKEN_SCOPES = [
  ...API_TOKEN_QSO_SCOPES,
  ...API_TOKEN_CALLSIGN_SCOPES,
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** Permission matrix rows shown in the create-token UI (Read / Write columns). */
export const API_TOKEN_PERMISSION_ROWS = [
  {
    key: "qso",
    labelKey: "apiTokenPermissionQso",
    read: "qso:read",
    write: "qso:write",
  },
  {
    key: "callsign",
    labelKey: "apiTokenPermissionCallsign",
    read: "callsign:read",
    write: "callsign:write",
  },
] as const satisfies ReadonlyArray<{
  key: string;
  labelKey: string;
  read: ApiTokenScope;
  write: ApiTokenScope | null;
}>;

export type ApiTokenPermissionRow = (typeof API_TOKEN_PERMISSION_ROWS)[number];

/** Scopes this role is allowed to grant on an API token. */
export function availableApiTokenScopes(role?: string | null): ApiTokenScope[] {
  const scopes: ApiTokenScope[] = [...API_TOKEN_QSO_SCOPES];
  if (canManageCallsigns(role)) {
    scopes.push(...API_TOKEN_CALLSIGN_SCOPES);
  }
  return scopes;
}

/** Default checked scopes for a new token (all scopes available to the role). */
export function defaultApiTokenScopes(role?: string | null): ApiTokenScope[] {
  return availableApiTokenScopes(role);
}

export function isApiTokenScope(value: string): value is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(value);
}

/**
 * Resolve requested scopes against what the role may grant.
 * Returns null when the request is invalid (empty or includes forbidden scopes).
 */
export function resolveApiTokenScopes(
  role: string | null | undefined,
  requested: unknown,
): ApiTokenScope[] | null {
  const allowed = new Set(availableApiTokenScopes(role));
  if (!Array.isArray(requested)) {
    return null;
  }
  const unique = new Set<ApiTokenScope>();
  for (const item of requested) {
    if (typeof item !== "string" || !isApiTokenScope(item)) {
      return null;
    }
    if (!allowed.has(item)) {
      return null;
    }
    unique.add(item);
  }
  if (unique.size === 0) {
    return null;
  }
  return API_TOKEN_SCOPES.filter((scope) => unique.has(scope));
}
