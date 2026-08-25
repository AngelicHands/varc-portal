import { normalizeRoleKey } from "@/lib/roles";

export type ContentViewAccess = {
  allowPublic?: boolean | null;
  allowedUserIds?: Array<string | { toString(): string }> | null;
  allowedRoleKeys?: string[] | null;
};

export type ContentViewer = {
  id?: string | null;
  role?: string | null;
  /** Editorial/admin bypass — can always view. */
  canBypass?: boolean;
} | null;

function idSet(
  ids: ContentViewAccess["allowedUserIds"],
): Set<string> {
  const set = new Set<string>();
  for (const id of ids ?? []) {
    const value = String(id ?? "").trim();
    if (value) set.add(value);
  }
  return set;
}

function roleSet(keys: ContentViewAccess["allowedRoleKeys"]): Set<string> {
  const set = new Set<string>();
  for (const key of keys ?? []) {
    const value = String(key ?? "").trim().toLowerCase();
    if (value) set.add(value);
  }
  return set;
}

/**
 * Who may view a published article/page.
 *
 * - allowPublic (default true): anyone, including anonymous
 * - when private: logged-in users only; empty user + role lists = all authenticated
 * - otherwise: user id in allowedUserIds OR role in allowedRoleKeys
 */
export function canViewPublishedContent(
  doc: ContentViewAccess,
  viewer: ContentViewer,
): boolean {
  if (viewer?.canBypass) return true;

  const allowPublic = doc.allowPublic !== false;
  if (allowPublic) return true;

  const userId = viewer?.id?.trim() || "";
  if (!userId) return false;

  const users = idSet(doc.allowedUserIds);
  const roles = roleSet(doc.allowedRoleKeys);

  if (users.size === 0 && roles.size === 0) return true;
  if (users.has(userId)) return true;

  const rawRole = String(viewer?.role ?? "").trim().toLowerCase();
  if (rawRole && roles.has(rawRole)) return true;
  const normalized = normalizeRoleKey(viewer?.role ?? null);
  if (roles.has(normalized)) return true;

  return false;
}

/** Mongo filter fragment: only content safe for anonymous / public caches. */
export function publicContentMongoFilter(): { allowPublic: { $ne: false } } {
  return { allowPublic: { $ne: false } };
}

export function contentViewerFromSession(
  session: {
    user?: { id?: string | null; role?: string | null } | null;
  } | null,
  canBypass = false,
): ContentViewer {
  return {
    id: session?.user?.id ? String(session.user.id) : null,
    role: session?.user?.role ?? null,
    canBypass,
  };
}
