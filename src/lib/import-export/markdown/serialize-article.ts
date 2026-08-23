import type { ArticleDocument } from "@/models/Article";
import type { ArticleContentSource } from "@/lib/article-content-source";
import { pushHeadingField } from "@/lib/import-export/markdown/section-fields";

export type SerializedArticleSharedMetadata = {
  id: string;
  base: string;
  status: string;
  publishedAt: string | null;
  tags: string[];
  featured: boolean;
  coverImageUrl: string;
  coverImageFocus: string;
  ogImageUrl: string;
  authorEmail: string;
  contentSource: ArticleContentSource;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SerializedArticleLocaleContent = {
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  contentMarkdown: string;
};

function formatFocus(focus: unknown): string {
  if (!focus || typeof focus !== "object") return "50,50";
  const value = focus as Record<string, unknown>;
  const x = Number(value.x ?? 50);
  const y = Number(value.y ?? 50);
  const width = Number(value.width);
  const height = Number(value.height);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return `${x},${y},${width},${height}`;
  }
  return `${x},${y}`;
}

export function buildArticleSharedMetadata(params: {
  article: ArticleDocument;
  base: string;
  authorEmail: string;
  coverImageUrl: string;
  ogImageUrl: string;
}): SerializedArticleSharedMetadata {
  const { article } = params;
  return {
    id: String(article._id),
    base: params.base,
    status: article.status ?? "draft",
    publishedAt: article.publishedAt
      ? new Date(article.publishedAt).toISOString()
      : null,
    tags: [...(article.tags ?? [])],
    featured: Boolean(article.featured),
    coverImageUrl: params.coverImageUrl,
    coverImageFocus: formatFocus(article.coverImageFocus),
    ogImageUrl: params.ogImageUrl,
    authorEmail: params.authorEmail,
    contentSource: (article.contentSource ?? "cms") as ArticleContentSource,
    createdAt: article.createdAt
      ? new Date(article.createdAt).toISOString()
      : null,
    updatedAt: article.updatedAt
      ? new Date(article.updatedAt).toISOString()
      : null,
  };
}

export function serializeArticleMarkdown(params: {
  locale: "vi" | "en";
  categoriesLine: string;
  shared: SerializedArticleSharedMetadata;
  localeContent: SerializedArticleLocaleContent;
}): string {
  const { shared, localeContent } = params;
  const lines: string[] = [`# ${localeContent.title}`, ""];

  lines.push("## Excerpt");
  lines.push(localeContent.excerpt.trim() || "_No excerpt._");
  lines.push("");

  lines.push("## Categories");
  lines.push(params.categoriesLine.trim() || "uncategorized");
  lines.push("");

  lines.push("## Metadata");
  lines.push("");
  pushHeadingField(lines, "id", shared.id);
  pushHeadingField(lines, "base", shared.base);
  pushHeadingField(lines, "status", shared.status);
  pushHeadingField(lines, "publishedAt", shared.publishedAt);
  if (shared.tags.length > 0) {
    pushHeadingField(lines, "tags", shared.tags.join(", "));
  }
  pushHeadingField(lines, "featured", shared.featured ? "true" : "false");
  pushHeadingField(lines, "coverImageUrl", shared.coverImageUrl);
  pushHeadingField(lines, "coverImageFocus", shared.coverImageFocus);
  pushHeadingField(lines, "ogImageUrl", shared.ogImageUrl);
  pushHeadingField(lines, "authorEmail", shared.authorEmail);
  pushHeadingField(lines, "contentSource", shared.contentSource);
  pushHeadingField(lines, "createdAt", shared.createdAt);
  pushHeadingField(lines, "updatedAt", shared.updatedAt);

  lines.push("## SEO");
  lines.push("");
  pushHeadingField(lines, "metaTitle", localeContent.metaTitle.trim());
  pushHeadingField(
    lines,
    "metaDescription",
    localeContent.metaDescription.trim(),
  );

  lines.push("## Content");
  lines.push("");
  if (localeContent.contentMarkdown.trim()) {
    lines.push(localeContent.contentMarkdown.trim());
  } else {
    lines.push("_No content._");
  }
  lines.push("");

  return `${lines.join("\n").trim()}\n`;
}
