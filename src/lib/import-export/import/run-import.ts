import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { markdownToHtml } from "@/lib/import-export/markdown/markdown-to-html";
import {
  mergeArticlePair,
  parseArticleLocaleMarkdown,
  type ParsedArticlePair,
} from "@/lib/import-export/markdown/parse-article-markdown";
import {
  mergeCategoryPair,
  parseCategoryMarkdown,
  sortCategoriesByParent,
} from "@/lib/import-export/markdown/parse-category-markdown";
import {
  downloadGitHubFile,
  listGitHubRepoBlobs,
  resolveExportBranchFromGithub,
  resolveOwnerRepo,
} from "@/lib/import-export/github-client";
import {
  ImportMediaResolver,
  isBinarySyncPath,
  loadBundledMediaFiles,
} from "@/lib/import-export/import/import-media";
import { loadImportGithubConfig } from "@/lib/import-export/import/load-import-config";
import { parseLocaleMarkdownPath } from "@/lib/import-export/sync-paths";
import { uniqueSlugFromTitle } from "@/lib/slug";
import {
  ensureUncategorizedCategory,
  notDeletedFilter,
  UNCATEGORIZED_KEY,
} from "@/lib/soft-delete";
import { Article } from "@/models/Article";
import { Category } from "@/models/Category";
import { User } from "@/models/User";

export type CmsImportRunResult = {
  stats: {
    categories: number;
    articles: number;
    mediaFiles: number;
    skippedPairs: number;
  };
};

type LocaleMarkdownPair = {
  base: string;
  vi?: string;
  en?: string;
};

function groupLocaleMarkdownPairs(
  paths: string[],
  syncRoot: string,
  kind: "category" | "article",
): LocaleMarkdownPair[] {
  const byBase = new Map<string, LocaleMarkdownPair>();

  for (const path of paths) {
    const parsed = parseLocaleMarkdownPath(path, syncRoot, kind);
    if (!parsed) continue;

    const entry = byBase.get(parsed.base) ?? { base: parsed.base };
    if (parsed.locale === "vi") entry.vi = path;
    if (parsed.locale === "en") entry.en = path;
    byBase.set(parsed.base, entry);
  }

  return [...byBase.values()];
}

async function categorySlugTaken(
  locale: "vi" | "en",
  slug: string,
  excludeId?: string | null,
) {
  const filter: Record<string, unknown> = {
    ...notDeletedFilter,
    [`locales.${locale}.slug`]: slug,
  };
  if (excludeId && mongoose.isValidObjectId(excludeId)) {
    filter._id = { $ne: excludeId };
  }
  return Boolean(await Category.exists(filter));
}

async function articleSlugTaken(
  locale: "vi" | "en",
  slug: string,
  excludeId?: string | null,
) {
  const filter: Record<string, unknown> = {
    ...notDeletedFilter,
    [`locales.${locale}.slug`]: slug,
  };
  if (excludeId && mongoose.isValidObjectId(excludeId)) {
    filter._id = { $ne: excludeId };
  }
  return Boolean(await Article.exists(filter));
}

async function findCategoryForImport(params: {
  base: string;
  key: string;
}) {
  if (params.key) {
    const byKey = await Category.findOne({
      key: params.key,
      ...notDeletedFilter,
    });
    if (byKey) return byKey;
  }

  const byViSlug = await Category.findOne({
    "locales.vi.slug": params.base,
    ...notDeletedFilter,
  });
  if (byViSlug) return byViSlug;

  return Category.findOne({
    "locales.en.slug": params.base,
    ...notDeletedFilter,
  });
}

async function findArticleForImport(params: {
  id: string;
  base: string;
}) {
  if (params.id && mongoose.isValidObjectId(params.id)) {
    const byId = await Article.findOne({
      _id: params.id,
      ...notDeletedFilter,
    });
    if (byId) return byId;
  }

  const byViSlug = await Article.findOne({
    "locales.vi.slug": params.base,
    ...notDeletedFilter,
  });
  if (byViSlug) return byViSlug;

  return Article.findOne({
    "locales.en.slug": params.base,
    ...notDeletedFilter,
  });
}

async function resolveAuthorId(params: {
  authorEmail: string;
  fallbackUserId: string;
}) {
  const email = params.authorEmail.trim().toLowerCase();
  if (email) {
    const user = await User.findOne({ email }).lean();
    if (user?._id) {
      return new mongoose.Types.ObjectId(String(user._id));
    }
  }
  return new mongoose.Types.ObjectId(params.fallbackUserId);
}

async function upsertCategory(params: {
  merged: ReturnType<typeof mergeCategoryPair>;
  baseToId: Map<string, string>;
}) {
  const { merged } = params;
  const existing = await findCategoryForImport({
    base: merged.base,
    key: merged.key,
  });
  const excludeId = existing ? String(existing._id) : null;

  const viName = merged.locales.vi.name.trim();
  const enName = merged.locales.en.name.trim();

  const locales = {
    vi: {
      name: viName,
      slug: viName
        ? await uniqueSlugFromTitle(viName, (slug) =>
            categorySlugTaken("vi", slug, excludeId),
          )
        : "",
      description: merged.locales.vi.description.trim(),
    },
    en: {
      name: enName,
      slug: enName
        ? await uniqueSlugFromTitle(enName, (slug) =>
            categorySlugTaken("en", slug, excludeId),
          )
        : "",
      description: merged.locales.en.description.trim(),
    },
  };

  const parentId =
    merged.parentBase && params.baseToId.has(merged.parentBase)
      ? new mongoose.Types.ObjectId(params.baseToId.get(merged.parentBase)!)
      : null;

  const isUncategorized = merged.key === UNCATEGORIZED_KEY;

  if (existing) {
    existing.locales = locales;
    existing.sortOrder = merged.sortOrder;
    existing.parentId = parentId;
    if (merged.key) existing.key = merged.key;
    if (isUncategorized || merged.isSystem) {
      existing.isSystem = true;
    }
    await existing.save();
    params.baseToId.set(merged.base, String(existing._id));
    if (merged.key) params.baseToId.set(merged.key, String(existing._id));
    return existing;
  }

  const created = await Category.create({
    key: merged.key || null,
    isSystem: isUncategorized || merged.isSystem,
    parentId,
    sortOrder: merged.sortOrder,
    locales,
    deletedAt: null,
  });

  params.baseToId.set(merged.base, String(created._id));
  if (merged.key) params.baseToId.set(merged.key, String(created._id));
  return created;
}

async function resolveCategoryIds(params: {
  bases: string[];
  baseToId: Map<string, string>;
}) {
  const uncategorized = await ensureUncategorizedCategory();
  const ids: mongoose.Types.ObjectId[] = [];

  for (const base of params.bases) {
    const normalized = base.trim();
    if (!normalized || normalized === UNCATEGORIZED_KEY) {
      ids.push(uncategorized._id);
      continue;
    }

    const id = params.baseToId.get(normalized);
    if (id) {
      ids.push(new mongoose.Types.ObjectId(id));
    }
  }

  const unique = [
    ...new Map(ids.map((id) => [String(id), id])).values(),
  ];

  return unique.length > 0 ? unique : [uncategorized._id];
}

async function upsertArticle(params: {
  pair: ParsedArticlePair;
  media: ImportMediaResolver;
  baseToCategoryId: Map<string, string>;
  fallbackUserId: string;
}) {
  const { pair, media } = params;
  const existing = await findArticleForImport({
    id: pair.shared.id,
    base: pair.shared.base,
  });
  const excludeId = existing ? String(existing._id) : null;

  const viTitle = pair.locales.vi.title.trim();
  const enTitle = pair.locales.en.title.trim();

  const viContentMarkdown = await media.resolveMarkdownImages(
    pair.locales.vi.contentMarkdown,
  );
  const enContentMarkdown = await media.resolveMarkdownImages(
    pair.locales.en.contentMarkdown,
  );

  let viContent = await markdownToHtml(viContentMarkdown);
  let enContent = await markdownToHtml(enContentMarkdown);
  viContent = await media.resolveHtmlImages(viContent);
  enContent = await media.resolveHtmlImages(enContent);

  const locales = {
    vi: {
      title: viTitle,
      slug: viTitle
        ? await uniqueSlugFromTitle(viTitle, (slug) =>
            articleSlugTaken("vi", slug, excludeId),
          )
        : "",
      excerpt: pair.locales.vi.excerpt.trim(),
      content: viContent,
      metaTitle: pair.locales.vi.metaTitle.trim(),
      metaDescription: pair.locales.vi.metaDescription.trim(),
    },
    en: {
      title: enTitle,
      slug: enTitle
        ? await uniqueSlugFromTitle(enTitle, (slug) =>
            articleSlugTaken("en", slug, excludeId),
          )
        : "",
      excerpt: pair.locales.en.excerpt.trim(),
      content: enContent,
      metaTitle: pair.locales.en.metaTitle.trim(),
      metaDescription: pair.locales.en.metaDescription.trim(),
    },
  };

  const categoryIds = await resolveCategoryIds({
    bases: pair.categories,
    baseToId: params.baseToCategoryId,
  });

  const coverImageUrl = await media.resolveOptional(pair.shared.coverImageUrl);
  const ogImageUrl = await media.resolveOptional(pair.shared.ogImageUrl);
  const authorId = await resolveAuthorId({
    authorEmail: pair.shared.authorEmail,
    fallbackUserId: params.fallbackUserId,
  });

  const payload = {
    status: pair.shared.status,
    publishedAt: pair.shared.publishedAt,
    featured: pair.shared.featured,
    coverImageUrl,
    coverImageFocus: pair.shared.coverImageFocus,
    ogImageUrl,
    categoryIds,
    tags: pair.shared.tags,
    locales,
    authorId,
    contentSource: "git" as const,
  };

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return existing;
  }

  return Article.create(payload);
}

export async function runCmsImportFromGithub(params: {
  fallbackUserId: string;
}): Promise<CmsImportRunResult> {
  const config = await loadImportGithubConfig();
  const ownerRepo = resolveOwnerRepo(config.repoUrl);
  const branch = await resolveExportBranchFromGithub({
    ownerRepo,
    pat: config.pat,
    branch: config.branch,
  });

  await connectDb();
  await ensureUncategorizedCategory();

  const blobs = await listGitHubRepoBlobs({
    ownerRepo,
    branch,
    pat: config.pat,
    syncRoot: config.syncRoot,
  });

  const markdownPaths: string[] = [];
  const binaryPaths: string[] = [];

  for (const blob of blobs) {
    if (isBinarySyncPath(config.syncRoot, blob.path)) {
      binaryPaths.push(blob.path);
    } else if (blob.path.endsWith(".md")) {
      markdownPaths.push(blob.path);
    }
  }

  const textContents = new Map<string, string>();
  const binaryContents: Array<{ path: string; content: Buffer }> = [];

  await Promise.all(
    markdownPaths.map(async (path) => {
      const buffer = await downloadGitHubFile({
        ownerRepo,
        pat: config.pat,
        path,
        ref: branch,
      });
      textContents.set(path, buffer.toString("utf8"));
    }),
  );

  await Promise.all(
    binaryPaths.map(async (path) => {
      const content = await downloadGitHubFile({
        ownerRepo,
        pat: config.pat,
        path,
        ref: branch,
      });
      binaryContents.push({ path, content });
    }),
  );

  const mediaFiles = loadBundledMediaFiles({ blobs: binaryContents });
  const media = new ImportMediaResolver({
    syncRoot: config.syncRoot,
    files: mediaFiles,
    uploadedBy: params.fallbackUserId,
  });

  const baseToCategoryId = new Map<string, string>();
  const uncategorized = await ensureUncategorizedCategory();
  baseToCategoryId.set(UNCATEGORIZED_KEY, String(uncategorized._id));
  baseToCategoryId.set("uncategorized", String(uncategorized._id));

  let categoriesImported = 0;
  let skippedPairs = 0;

  const categoryPairs = groupLocaleMarkdownPairs(
    markdownPaths.filter((path) =>
      parseLocaleMarkdownPath(path, config.syncRoot, "category"),
    ),
    config.syncRoot,
    "category",
  );

  const mergedCategories = categoryPairs
    .filter((pair) => {
      if (!pair.vi || !pair.en) {
        skippedPairs += 1;
        return false;
      }
      return true;
    })
    .map((pair) => {
      const vi = parseCategoryMarkdown({
        base: pair.base,
        locale: "vi",
        markdown: textContents.get(pair.vi!) ?? "",
      });
      const en = parseCategoryMarkdown({
        base: pair.base,
        locale: "en",
        markdown: textContents.get(pair.en!) ?? "",
      });
      return mergeCategoryPair(vi, en);
    });

  for (const merged of sortCategoriesByParent(mergedCategories)) {
    await upsertCategory({ merged, baseToId: baseToCategoryId });
    categoriesImported += 1;
  }

  let articlesImported = 0;

  const articlePairs = groupLocaleMarkdownPairs(
    markdownPaths.filter((path) =>
      parseLocaleMarkdownPath(path, config.syncRoot, "article"),
    ),
    config.syncRoot,
    "article",
  );

  for (const pair of articlePairs) {
    if (!pair.vi || !pair.en) {
      skippedPairs += 1;
      continue;
    }

    const viParsed = parseArticleLocaleMarkdown({
      locale: "vi",
      markdown: textContents.get(pair.vi) ?? "",
    });
    const enParsed = parseArticleLocaleMarkdown({
      locale: "en",
      markdown: textContents.get(pair.en) ?? "",
    });

    const merged = mergeArticlePair({
      base: pair.base,
      vi: viParsed,
      en: enParsed,
    });

    const parsedPair: ParsedArticlePair = {
      base: merged.base,
      categories: merged.categories,
      shared: merged.shared,
      locales: merged.locales,
    };

    await upsertArticle({
      pair: parsedPair,
      media,
      baseToCategoryId,
      fallbackUserId: params.fallbackUserId,
    });
    articlesImported += 1;
  }

  return {
    stats: {
      categories: categoriesImported,
      articles: articlesImported,
      mediaFiles: binaryContents.length,
      skippedPairs,
    },
  };
}
