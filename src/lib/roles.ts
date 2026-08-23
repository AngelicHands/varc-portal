export const ROLE_KEYS = [
  "setup_admin",
  "administrator",
  "editor",
  "reader",
] as const;

export type Role = (typeof ROLE_KEYS)[number];

/** Legacy keys still accepted until migration runs. */
export const LEGACY_ROLE_MAP = {
  system_admin: "setup_admin",
  user: "reader",
} as const;

export type AnyRoleKey = Role | keyof typeof LEGACY_ROLE_MAP;

export const ROLE_CAPABILITY_KEYS = [
  "canAccessAdmin",
  "canManageContent",
  "canManagePages",
  "canManageSite",
  "canManageUsers",
  "canManageRoles",
] as const;

export type RoleCapabilityKey = (typeof ROLE_CAPABILITY_KEYS)[number];

export type RoleCapabilityFlags = Record<RoleCapabilityKey, boolean>;

export const ROLE_PERMISSION_CATEGORIES: Array<{
  key: RoleCapabilityKey;
  label: string;
  description: string;
}> = [
  {
    key: "canAccessAdmin",
    label: "Admin",
    description: "Open the admin panel",
  },
  {
    key: "canManageContent",
    label: "Articles & Categories",
    description: "Create and edit articles, categories, and media",
  },
  {
    key: "canManagePages",
    label: "Pages",
    description: "Create and edit CMS pages",
  },
  {
    key: "canManageSite",
    label: "Site",
    description:
      "Menus, settings, backup, mailbox, forms, templates, and callsigns",
  },
  {
    key: "canManageUsers",
    label: "Users",
    description: "View and manage user accounts",
  },
  {
    key: "canManageRoles",
    label: "Roles",
    description: "Edit role labels, assignment, and permissions",
  },
];

export type CapabilitySource =
  | string
  | null
  | undefined
  | (Partial<RoleCapabilityFlags> & { role?: string | null });

export const DEFAULT_ROLES: Array<
  {
    key: Role;
    label: string;
    description: string;
    sortOrder: number;
  } & RoleCapabilityFlags
> = [
  {
    key: "setup_admin",
    label: "Setup Admin",
    description: "Full system access, including users and roles (system admin).",
    sortOrder: 0,
    canAccessAdmin: true,
    canManageContent: true,
    canManagePages: true,
    canManageSite: true,
    canManageUsers: true,
    canManageRoles: true,
  },
  {
    key: "administrator",
    label: "Administrator",
    description: "Manage site content, menus, settings, and most user roles.",
    sortOrder: 1,
    canAccessAdmin: true,
    canManageContent: true,
    canManagePages: true,
    canManageSite: true,
    canManageUsers: true,
    canManageRoles: false,
  },
  {
    key: "editor",
    label: "Editor",
    description: "Create and edit articles, categories, and pages.",
    sortOrder: 2,
    canAccessAdmin: true,
    canManageContent: true,
    canManagePages: true,
    canManageSite: false,
    canManageUsers: false,
    canManageRoles: false,
  },
  {
    key: "reader",
    label: "Reader",
    description: "Public portal access only; cannot open the admin panel.",
    sortOrder: 3,
    canAccessAdmin: false,
    canManageContent: false,
    canManagePages: false,
    canManageSite: false,
    canManageUsers: false,
    canManageRoles: false,
  },
];

export function normalizeRoleKey(role?: string | null): Role {
  if (!role) return "reader";
  if (role in LEGACY_ROLE_MAP) {
    return LEGACY_ROLE_MAP[role as keyof typeof LEGACY_ROLE_MAP];
  }
  if ((ROLE_KEYS as readonly string[]).includes(role)) {
    return role as Role;
  }
  return "reader";
}

const EMPTY_CAPABILITIES: RoleCapabilityFlags = {
  canAccessAdmin: false,
  canManageContent: false,
  canManagePages: false,
  canManageSite: false,
  canManageUsers: false,
  canManageRoles: false,
};

export function defaultCapabilitiesFor(role?: string | null): RoleCapabilityFlags {
  const key = normalizeRoleKey(role);
  const found = DEFAULT_ROLES.find((item) => item.key === key);
  if (!found) return { ...EMPTY_CAPABILITIES };
  return {
    canAccessAdmin: found.canAccessAdmin,
    canManageContent: found.canManageContent,
    canManagePages: found.canManagePages,
    canManageSite: found.canManageSite,
    canManageUsers: found.canManageUsers,
    canManageRoles: found.canManageRoles,
  };
}

let runtimeCapabilities: Map<string, RoleCapabilityFlags> | null = null;

export function setRuntimeRoleCapabilities(
  map: Map<string, RoleCapabilityFlags> | null,
) {
  runtimeCapabilities = map;
}

export function getRuntimeRoleCapabilities(): Map<
  string,
  RoleCapabilityFlags
> | null {
  return runtimeCapabilities;
}

export function pickRoleCapabilities(
  source: Partial<RoleCapabilityFlags> | Record<string, unknown> | null | undefined,
): Partial<RoleCapabilityFlags> {
  if (!source) return {};
  const out: Partial<RoleCapabilityFlags> = {};
  for (const key of ROLE_CAPABILITY_KEYS) {
    if (typeof source[key] === "boolean") out[key] = source[key];
  }
  return out;
}

function cachedOrDefault(role?: string | null): RoleCapabilityFlags {
  const key = normalizeRoleKey(role);
  return runtimeCapabilities?.get(key) ?? defaultCapabilitiesFor(key);
}

function isCapabilityObject(
  source: CapabilitySource,
): source is Partial<RoleCapabilityFlags> & { role?: string | null } {
  return Boolean(source) && typeof source === "object";
}

export function resolveCapabilities(
  source?: CapabilitySource,
): RoleCapabilityFlags {
  if (isCapabilityObject(source)) {
    const defaults = cachedOrDefault(source.role);
    return {
      canAccessAdmin: source.canAccessAdmin ?? defaults.canAccessAdmin,
      canManageContent: source.canManageContent ?? defaults.canManageContent,
      canManagePages: source.canManagePages ?? defaults.canManagePages,
      canManageSite: source.canManageSite ?? defaults.canManageSite,
      canManageUsers: source.canManageUsers ?? defaults.canManageUsers,
      canManageRoles: source.canManageRoles ?? defaults.canManageRoles,
    };
  }
  return cachedOrDefault(source);
}

export function isAdminRole(source?: CapabilitySource): boolean {
  return resolveCapabilities(source).canAccessAdmin;
}

export function isSystemAdmin(role?: string | null): boolean {
  return normalizeRoleKey(role) === "setup_admin";
}

export function canManageUsers(source?: CapabilitySource): boolean {
  return resolveCapabilities(source).canManageUsers;
}

export function canManageRoles(source?: CapabilitySource): boolean {
  return resolveCapabilities(source).canManageRoles;
}

/** Articles + categories. */
export function canManageEditorial(source?: CapabilitySource): boolean {
  return resolveCapabilities(source).canManageContent;
}

export function canManageArticles(source?: CapabilitySource): boolean {
  return canManageEditorial(source);
}

export function canManageCategories(source?: CapabilitySource): boolean {
  return canManageEditorial(source);
}

export function canManagePages(source?: CapabilitySource): boolean {
  return resolveCapabilities(source).canManagePages;
}

export function canManageSite(source?: CapabilitySource): boolean {
  return resolveCapabilities(source).canManageSite;
}

export function canManageCallsigns(source?: CapabilitySource): boolean {
  return canManageSite(source);
}

/** GitHub CMS import/export — Setup Admin and Administrator only. */
export function canManageImportExport(source?: CapabilitySource): boolean {
  const role =
    isCapabilityObject(source) && source.role != null
      ? source.role
      : typeof source === "string"
        ? source
        : null;
  const key = normalizeRoleKey(role);
  return key === "setup_admin" || key === "administrator";
}

/**
 * Who may change whose role:
 * - Setup Admin: anyone (including self)
 * - Administrator: anyone except self and Setup Admin; cannot assign Setup Admin
 * - Editor / Reader: nobody (including self)
 */
export function canChangeUserRole(params: {
  actorRole?: string | null;
  actorUserId?: string | null;
  targetUserId: string;
  targetCurrentRole?: string | null;
  nextRole?: string | null;
}): boolean {
  const actor = normalizeRoleKey(params.actorRole);
  const targetCurrent = normalizeRoleKey(params.targetCurrentRole);
  const next = params.nextRole
    ? normalizeRoleKey(params.nextRole)
    : undefined;

  if (actor === "setup_admin") {
    return true;
  }

  if (actor !== "administrator") {
    return false;
  }

  if (
    params.actorUserId &&
    params.actorUserId === params.targetUserId
  ) {
    return false;
  }

  if (targetCurrent === "setup_admin") {
    return false;
  }

  if (next === "setup_admin") {
    return false;
  }

  return true;
}

export function assignableRolesForActor<T extends { key: string }>(
  actorRole: string | null | undefined,
  allRoles: T[],
): T[] {
  const actor = normalizeRoleKey(actorRole);
  if (actor === "setup_admin") return allRoles;
  if (actor === "administrator") {
    return allRoles.filter((role) => role.key !== "setup_admin");
  }
  return [];
}
