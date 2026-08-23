import { getCategoryLocale } from "@/lib/cms";
import { ExportMediaCollector } from "@/lib/import-export/export/export-media";
import {
  extractImageUrlsFromHtml,
  htmlToMarkdown,
  replaceImageUrlsInHtml,
} from "@/lib/import-export/markdown/html-to-markdown";
import {
  buildArticleSharedMetadata,
  serializeArticleMarkdown,
} from "@/lib/import-export/markdown/serialize-article";
import {
  categoryMetadataFromDocument,
  serializeCategoryMarkdown,
} from "@/lib/import-export/markdown/serialize-category";
import {
  articleMarkdownPath,
  articleRepoBase,
  categoryMarkdownPath,
  categoryRepoBase,
} from "@/lib/import-export/sync-paths";
import type { GitHubCommitFile } from "@/lib/import-export/github-client";
import { listAllArticles } from "@/lib/articles";
import { connectDb } from "@/lib/db";
import { notDeletedFilter } from "@/lib/soft-delete";
import { Category, type CategoryDocument } from "@/models/Category";
import { User } from "@/models/User";
import mongoose from "mongoose";

export type CmsExportBuildResult = {
  files: GitHubCommitFile[];
  stats: {
    categories: number;
    articles: number;
    mediaFiles: number;
    markdownFiles: number;
  };
};

function categoryBasesLine(
  categoryIds: mongoose.Types.ObjectId[] | undefined,
  baseById: Map<string, string>,
): string {
  const bases = (categoryIds ?? [])
    .map((id) => baseById.get(String(id)))
    .filter((value): value is string => Boolean(value));
  return [...new Set(bases)].join(", ");
}

export async function buildCmsExportFiles(
  syncRoot: string,
): Promise<CmsExportBuildResult> {
  await connectDb();

  const categories = await Category.find(notDeletedFilter)
    .sort({ sortOrder: 1, isSystem: -1, createdAt: -1 })
    .lean<CategoryDocument[]>();

  const baseById = new Map<string, string>();
  const nameByBase = new Map<string, { vi: string; en: string }>();

  for (const category of categories) {
    const base = categoryRepoBase(category);
    baseById.set(String(category._id), base);
    nameByBase.set(base, {
      vi: getCategoryLocale(category, "vi").name,
      en: getCategoryLocale(category, "en").name,
    });
  }

  const files: GitHubCommitFile[] = [];

  for (const category of categories) {
    const base = categoryRepoBase(category);
    const metadata = categoryMetadataFromDocument(category);
    const parentBase = category.parentId
      ? baseById.get(String(category.parentId)) ?? null
      : null;
    const parentName = parentBase
      ? nameByBase.get(parentBase)?.vi || parentBase
      : null;
    const parentNameEn = parentBase
      ? nameByBase.get(parentBase)?.en || parentBase
      : null;

    const vi = getCategoryLocale(category, "vi");
    const en = getCategoryLocale(category, "en");

    files.push({
      path: categoryMarkdownPath(syncRoot, base, "vi"),
      content: serializeCategoryMarkdown({
        locale: "vi",
        name: vi.name,
        description: vi.description,
        parentBase,
        parentName,
        metadata,
      }),
    });

    files.push({
      path: categoryMarkdownPath(syncRoot, base, "en"),
      content: serializeCategoryMarkdown({
        locale: "en",
        name: en.name,
        description: en.description,
        parentBase,
        parentName: parentNameEn,
        metadata,
      }),
    });
  }

  const articles = await listAllArticles();
  const authorIds = [
    ...new Set(
      articles
        .map((article) => String(article.authorId ?? ""))
        .filter(Boolean),
    ),
  ];
  const authors = await User.find({
    _id: { $in: authorIds.filter((id) => mongoose.isValidObjectId(id)) },
  })
    .select("email")
    .lean<Array<{ _id: mongoose.Types.ObjectId; email?: string }>>();
  const emailByAuthorId = new Map(
    authors.map((author) => [String(author._id), author.email ?? ""]),
  );

  let mediaFiles = 0;

  for (const article of articles) {
    const base = articleRepoBase(article);
    const media = new ExportMediaCollector(syncRoot, base);
    const authorEmail =
      emailByAuthorId.get(String(article.authorId ?? "")) ?? "";

    const coverImageUrl = await media.resolveOptional(article.coverImageUrl);
    const ogImageUrl = await media.resolveOptional(article.ogImageUrl);

    const shared = buildArticleSharedMetadata({
      article,
      base,
      authorEmail,
      coverImageUrl,
      ogImageUrl,
    });

    const categoriesLine = categoryBasesLine(
      article.categoryIds as mongoose.Types.ObjectId[] | undefined,
      baseById,
    );

    for (const locale of ["vi", "en"] as const) {
      const localeContent = article.locales?.[locale];
      if (!localeContent) continue;
      let html = localeContent.content ?? "";
      for (const url of extractImageUrlsFromHtml(html)) {
        const resolved = await media.resolve(url);
        if (resolved !== url) {
          html = replaceImageUrlsInHtml(html, (current) =>
            current === url ? resolved : current,
          );
        }
      }
      const contentMarkdown = htmlToMarkdown(html);

      files.push({
        path: articleMarkdownPath(syncRoot, base, locale),
        content: serializeArticleMarkdown({
          locale,
          categoriesLine,
          shared,
          localeContent: {
            title: localeContent.title ?? "",
            excerpt: localeContent.excerpt ?? "",
            metaTitle: localeContent.metaTitle ?? "",
            metaDescription: localeContent.metaDescription ?? "",
            contentMarkdown,
          },
        }),
      });
    }

    for (const binary of media.binaryFiles) {
      files.push(binary);
      mediaFiles += 1;
    }
  }

  const markdownFiles = files.filter(
    (file) => typeof file.content === "string",
  ).length;

  return {
    files,
    stats: {
      categories: categories.length,
      articles: articles.length,
      mediaFiles,
      markdownFiles,
    },
  };
}
