import { isGithubRepoRootPath, normalizeGithubPath } from "@/lib/validations/import-export";

/** Repo path prefixes never touched by CMS import/export. */
export const SYNC_EXCLUDED_REPO_PREFIXES = ["example"] as const;

export function isSyncExcludedRepoPath(repoPath: string): boolean {
  const normalized = repoPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized) return false;

  const firstSegment = normalized.split("/")[0]?.toLowerCase() ?? "";
  return (SYNC_EXCLUDED_REPO_PREFIXES as readonly string[]).includes(
    firstSegment,
  );
}

export function normalizeSyncRootPath(value: string): string {
  const normalized = normalizeGithubPath(value);
  if (isGithubRepoRootPath(normalized)) return "";
  return normalized;
}

export function joinRepoPath(syncRoot: string, ...parts: string[]): string {
  const segments = [
    normalizeSyncRootPath(syncRoot),
    ...parts.map((part) => part.replace(/^\/+|\/+$/g, "")),
  ].filter(Boolean);
  return segments.join("/");
}

export function categoryRepoBase(category: {
  key?: string | null;
  locales?: {
    vi?: { slug?: string | null };
    en?: { slug?: string | null };
  } | null;
  _id: unknown;
}): string {
  const key = category.key?.trim();
  if (key) return key;
  const viSlug = category.locales?.vi?.slug?.trim();
  if (viSlug) return viSlug;
  const enSlug = category.locales?.en?.slug?.trim();
  if (enSlug) return enSlug;
  return String(category._id);
}

export function articleRepoBase(article: {
  locales?: {
    vi?: { slug?: string | null };
    en?: { slug?: string | null };
  } | null;
  _id: unknown;
}): string {
  const viSlug = article.locales?.vi?.slug?.trim();
  if (viSlug) return viSlug;
  const enSlug = article.locales?.en?.slug?.trim();
  if (enSlug) return enSlug;
  return `article-${String(article._id)}`;
}

export function categoryMarkdownPath(
  syncRoot: string,
  base: string,
  locale: "vi" | "en",
): string {
  return joinRepoPath(syncRoot, "category", `${base}.${locale}.md`);
}

export function articleMarkdownPath(
  syncRoot: string,
  base: string,
  locale: "vi" | "en",
): string {
  return joinRepoPath(syncRoot, "article", `${base}.${locale}.md`);
}

export function articleMediaRepoPath(
  syncRoot: string,
  articleBase: string,
  fileName: string,
): string {
  return joinRepoPath(syncRoot, "media", articleBase, fileName);
}

export function stripSyncRootPath(
  repoPath: string,
  syncRoot: string,
): string {
  const normalized = repoPath.replace(/^\/+/, "");
  const root = normalizeSyncRootPath(syncRoot);
  if (!root) return normalized;
  return normalized.startsWith(`${root}/`)
    ? normalized.slice(root.length + 1)
    : normalized;
}

export function parseLocaleMarkdownPath(
  repoPath: string,
  syncRoot: string,
  kind: "category" | "article",
): { base: string; locale: "vi" | "en" } | null {
  const relative = stripSyncRootPath(repoPath, syncRoot);
  const match = relative.match(
    new RegExp(`^${kind}/([^/]+)\\.(vi|en)\\.md$`),
  );
  if (!match?.[1] || (match[2] !== "vi" && match[2] !== "en")) {
    return null;
  }
  return { base: match[1], locale: match[2] };
}

export function isMediaRepoPath(
  repoPath: string,
  syncRoot: string,
): boolean {
  const relative = stripSyncRootPath(repoPath, syncRoot);
  return relative.startsWith("media/");
}
