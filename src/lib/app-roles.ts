import { connectDb } from "@/lib/db";
import {
  DEFAULT_ROLES,
  LEGACY_ROLE_MAP,
  ROLE_CAPABILITY_KEYS,
  defaultCapabilitiesFor,
  getRuntimeRoleCapabilities,
  resolveCapabilities,
  setRuntimeRoleCapabilities,
  type Role,
  type RoleCapabilityFlags,
} from "@/lib/roles";
import { AppRole, type AppRoleDocument } from "@/models/AppRole";
import { User } from "@/models/User";

export type PublicRole = {
  id: string;
  key: string;
  label: string;
  description: string;
  sortOrder: number;
  isSystem: boolean;
  canAccessAdmin: boolean;
  canManageContent: boolean;
  canManagePages: boolean;
  canManageSite: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  enabled: boolean;
};

export function flagsFromRoleDoc(
  doc: Partial<AppRoleDocument> | null | undefined,
  key?: string,
): RoleCapabilityFlags {
  const defaults = defaultCapabilitiesFor(key ?? (doc?.key ? String(doc.key) : null));
  if (!doc) return defaults;
  return {
    canAccessAdmin:
      typeof doc.canAccessAdmin === "boolean"
        ? doc.canAccessAdmin
        : defaults.canAccessAdmin,
    canManageContent:
      typeof doc.canManageContent === "boolean"
        ? doc.canManageContent
        : defaults.canManageContent,
    canManagePages:
      typeof doc.canManagePages === "boolean"
        ? doc.canManagePages
        : defaults.canManagePages,
    canManageSite:
      typeof doc.canManageSite === "boolean"
        ? doc.canManageSite
        : defaults.canManageSite,
    canManageUsers:
      typeof doc.canManageUsers === "boolean"
        ? doc.canManageUsers
        : defaults.canManageUsers,
    canManageRoles:
      typeof doc.canManageRoles === "boolean"
        ? doc.canManageRoles
        : defaults.canManageRoles,
  };
}

function toPublicRole(doc: AppRoleDocument): PublicRole {
  const flags = flagsFromRoleDoc(doc, String(doc.key));
  return {
    id: String(doc._id),
    key: String(doc.key),
    label: doc.label,
    description: doc.description ?? "",
    sortOrder: doc.sortOrder ?? 0,
    isSystem: Boolean(doc.isSystem),
    ...flags,
    enabled: doc.enabled !== false,
  };
}

let migratedUsers = false;
let cacheLoad: Promise<void> | null = null;

export function invalidateRoleCapabilitiesCache() {
  cacheLoad = null;
  setRuntimeRoleCapabilities(null);
}

async function loadRoleCapabilitiesCache() {
  if (getRuntimeRoleCapabilities()) return;
  if (!cacheLoad) {
    cacheLoad = (async () => {
      await connectDb();
      const docs = await AppRole.find().lean<AppRoleDocument[]>();
      const map = new Map<string, RoleCapabilityFlags>();
      for (const role of DEFAULT_ROLES) {
        const doc = docs.find((item) => String(item.key) === role.key);
        map.set(role.key, flagsFromRoleDoc(doc, role.key));
      }
      for (const doc of docs) {
        const key = String(doc.key);
        if (!map.has(key)) map.set(key, flagsFromRoleDoc(doc, key));
      }
      setRuntimeRoleCapabilities(map);
    })().catch((error) => {
      cacheLoad = null;
      throw error;
    });
  }
  await cacheLoad;
}

export async function getRoleCapabilities(
  role?: string | null,
): Promise<RoleCapabilityFlags> {
  try {
    await loadRoleCapabilitiesCache();
  } catch {
    return defaultCapabilitiesFor(role);
  }
  return resolveCapabilities(role);
}

/** Seed built-in roles and migrate legacy user role keys. */
export async function ensureDefaultRoles(): Promise<PublicRole[]> {
  await connectDb();

  let changed = false;
  for (const role of DEFAULT_ROLES) {
    const existing = await AppRole.findOne({ key: role.key });
    if (!existing) {
      await AppRole.create({
        ...role,
        isSystem: true,
        enabled: true,
      });
      changed = true;
      continue;
    }

    existing.isSystem = true;
    if (!existing.label?.trim()) existing.label = role.label;
    if (!existing.description?.trim()) existing.description = role.description;
    if (typeof existing.sortOrder !== "number") existing.sortOrder = role.sortOrder;
    if (typeof existing.enabled !== "boolean") existing.enabled = true;
    for (const key of ROLE_CAPABILITY_KEYS) {
      if (typeof existing[key] !== "boolean") {
        existing[key] = role[key];
      }
    }
    if (existing.isModified()) {
      await existing.save();
      changed = true;
    }
  }

  if (!migratedUsers) {
    for (const [from, to] of Object.entries(LEGACY_ROLE_MAP)) {
      await User.updateMany({ role: from }, { $set: { role: to } });
    }
    migratedUsers = true;
  }

  if (changed) invalidateRoleCapabilitiesCache();

  return listRoles();
}

export async function listRoles(): Promise<PublicRole[]> {
  await connectDb();
  const count = await AppRole.countDocuments();
  if (count < DEFAULT_ROLES.length) {
    return ensureDefaultRoles();
  }

  const docs = await AppRole.find()
    .sort({ sortOrder: 1, label: 1 })
    .lean<AppRoleDocument[]>();
  return docs.map(toPublicRole);
}

export async function listAssignableRoles(): Promise<PublicRole[]> {
  const roles = await ensureDefaultRoles();
  return roles.filter((role) => role.enabled);
}

export function isValidRoleKey(key: string): key is Role {
  return DEFAULT_ROLES.some((role) => role.key === key);
}
