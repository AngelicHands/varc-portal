export const ARTICLE_CONTENT_SOURCES = ["cms", "git"] as const;

export type ArticleContentSource = (typeof ARTICLE_CONTENT_SOURCES)[number];

export function normalizeArticleContentSource(
  value: string | null | undefined,
): ArticleContentSource {
  return value === "git" ? "git" : "cms";
}

export function articleContentSourceLabel(source: ArticleContentSource): string {
  return source === "git" ? "Git" : "CMS";
}
