import { markdownToHtml } from "@/lib/import-export/markdown/markdown-to-html";
import {
  normalizeImportedText,
  parseHeadingFields,
  parseMarkdownDocument,
} from "@/lib/import-export/markdown/parse-sections";
import { normalizeCoverFocus } from "@/lib/cover-focus";
import { normalizeArticleContentSource } from "@/lib/article-content-source";

export type ParsedArticleLocaleMarkdown = {
  locale: "vi" | "en";
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  contentMarkdown: string;
};

export type ParsedArticleSharedMarkdown = {
  id: string;
  base: string;
  status: "draft" | "published";
  publishedAt: Date | null;
  tags: string[];
  featured: boolean;
  coverImageUrl: string;
  coverImageFocus: ReturnType<typeof normalizeCoverFocus>;
  ogImageUrl: string;
  authorEmail: string;
  contentSource: ReturnType<typeof normalizeArticleContentSource>;
};

export type ParsedArticlePair = {
  base: string;
  shared: ParsedArticleSharedMarkdown;
  categories: string[];
  locales: {
    vi: ParsedArticleLocaleMarkdown;
    en: ParsedArticleLocaleMarkdown;
  };
};

function parseBoolean(value: string | undefined): boolean {
  return (value ?? "").toLowerCase() === "true";
}

function parseTags(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function parseFocus(value: string | undefined) {
  if (!value?.trim()) return normalizeCoverFocus(null);
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length >= 4) {
    return normalizeCoverFocus({
      x: parts[0],
      y: parts[1],
      width: parts[2],
      height: parts[3],
    });
  }
  if (parts.length >= 2) {
    return normalizeCoverFocus({ x: parts[0], y: parts[1] });
  }
  return normalizeCoverFocus(null);
}

function parseStatus(value: string | undefined): "draft" | "published" {
  return value === "published" ? "published" : "draft";
}

function parsePublishedAt(
  value: string | undefined,
  status: "draft" | "published",
): Date | null {
  if (status !== "published" || !value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseArticleLocaleMarkdown(params: {
  locale: "vi" | "en";
  markdown: string;
}): {
  locale: "vi" | "en";
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  contentMarkdown: string;
  categoriesLine: string;
  metadata: Record<string, string>;
  seo: Record<string, string>;
} {
  const doc = parseMarkdownDocument(params.markdown);
  const metadata = parseHeadingFields(doc.sections.Metadata ?? "");
  const seo = parseHeadingFields(doc.sections.SEO ?? "");

  return {
    locale: params.locale,
    title: normalizeImportedText(doc.title),
    excerpt: normalizeImportedText(doc.sections.Excerpt ?? ""),
    metaTitle: seo.metaTitle ?? "",
    metaDescription: seo.metaDescription ?? "",
    contentMarkdown: normalizeImportedText(doc.contentBody),
    categoriesLine: normalizeImportedText(doc.sections.Categories ?? ""),
    metadata,
    seo,
  };
}

export function mergeArticlePair(params: {
  base: string;
  vi: ReturnType<typeof parseArticleLocaleMarkdown>;
  en: ReturnType<typeof parseArticleLocaleMarkdown>;
}): Omit<ParsedArticlePair, "locales"> & {
  locales: ParsedArticlePair["locales"];
} {
  const metadata = { ...params.en.metadata, ...params.vi.metadata };
  const status = parseStatus(metadata.status);
  const categories = [
    ...new Set(
      (params.vi.categoriesLine || params.en.categoriesLine || "uncategorized")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];

  return {
    base: metadata.base || params.base,
    categories,
    shared: {
      id: metadata.id ?? "",
      base: metadata.base || params.base,
      status,
      publishedAt: parsePublishedAt(metadata.publishedAt, status),
      tags: parseTags(metadata.tags),
      featured: parseBoolean(metadata.featured),
      coverImageUrl: metadata.coverImageUrl ?? "",
      coverImageFocus: parseFocus(metadata.coverImageFocus),
      ogImageUrl: metadata.ogImageUrl ?? "",
      authorEmail: metadata.authorEmail ?? "",
      contentSource: normalizeArticleContentSource(metadata.contentSource),
    },
    locales: {
      vi: {
        locale: "vi",
        title: params.vi.title,
        excerpt: params.vi.excerpt,
        metaTitle: params.vi.metaTitle,
        metaDescription: params.vi.metaDescription,
        contentMarkdown: params.vi.contentMarkdown,
      },
      en: {
        locale: "en",
        title: params.en.title,
        excerpt: params.en.excerpt,
        metaTitle: params.en.metaTitle,
        metaDescription: params.en.metaDescription,
        contentMarkdown: params.en.contentMarkdown,
      },
    },
  };
}

export async function articleLocalesToHtml(
  pair: ParsedArticlePair,
): Promise<{
  vi: { content: string };
  en: { content: string };
}> {
  return {
    vi: { content: await markdownToHtml(pair.locales.vi.contentMarkdown) },
    en: { content: await markdownToHtml(pair.locales.en.contentMarkdown) },
  };
}
