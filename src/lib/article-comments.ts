import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import {
  ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  normalizeAdminJobsPage,
} from "@/lib/admin-jobs-pagination";
import {
  canViewPublishedContent,
  contentViewerFromSession,
  type ContentViewer,
} from "@/lib/content-access";
import { canManageArticles, type CapabilitySource } from "@/lib/roles";
import { getSiteSettingsDocument } from "@/lib/cms";
import { notDeletedFilter } from "@/lib/soft-delete";
import {
  ARTICLE_COMMENTS_MODES,
  type ArticleCommentsMode,
} from "@/lib/validations/article-comments";
import { Article } from "@/models/Article";
import {
  ArticleComment,
  type ArticleCommentStatus,
} from "@/models/ArticleComment";
import { User } from "@/models/User";

export type PublicArticleComment = {
  id: string;
  body: string;
  status: ArticleCommentStatus;
  createdAt: string;
  author: {
    id: string;
    name: string;
    callsign: string | null;
  };
  isOwn: boolean;
};

export function normalizeCommentsMode(value: unknown): ArticleCommentsMode {
  if (
    typeof value === "string" &&
    (ARTICLE_COMMENTS_MODES as readonly string[]).includes(value)
  ) {
    return value as ArticleCommentsMode;
  }
  return "off";
}

export async function isArticleCommentsSiteEnabled(): Promise<boolean> {
  const doc = await getSiteSettingsDocument();
  return Boolean(doc?.articleCommentsEnabled);
}

export function commentsSectionVisible(params: {
  siteEnabled: boolean;
  mode: ArticleCommentsMode;
}): boolean {
  return params.siteEnabled && params.mode !== "off";
}

export async function loadArticleForComments(articleId: string) {
  if (!mongoose.isValidObjectId(articleId)) return null;
  await connectDb();
  return Article.findOne({
    _id: articleId,
    ...notDeletedFilter,
    status: "published",
    publishedAt: { $ne: null, $lte: new Date() },
  }).lean();
}

export async function listArticleCommentsForViewer(params: {
  articleId: string;
  viewer: ContentViewer | null;
  sessionUser: CapabilitySource & { id?: string | null };
}): Promise<PublicArticleComment[]> {
  const userId = params.sessionUser?.id ? String(params.sessionUser.id) : "";
  const isModerator = canManageArticles(params.sessionUser);

  await connectDb();
  const filter: Record<string, unknown> = {
    articleId: params.articleId,
    deletedAt: null,
  };

  if (isModerator) {
    filter.status = { $in: ["published", "pending"] };
  } else if (userId) {
    filter.$or = [
      { status: "published" },
      { status: "pending", authorUserId: userId },
    ];
  } else {
    filter.status = "published";
  }

  const docs = await ArticleComment.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const authorIds = [
    ...new Set(docs.map((doc) => String(doc.authorUserId)).filter(Boolean)),
  ];
  const authors = authorIds.length
    ? await User.find({ _id: { $in: authorIds } })
        .select({ name: 1, callsign: 1 })
        .lean()
    : [];
  const byId = new Map(
    authors.map((user) => [
      String(user._id),
      {
        id: String(user._id),
        name: user.name?.trim() || "Member",
        callsign: user.callsign?.trim() || null,
      },
    ]),
  );

  return docs.map((doc) => {
    const authorId = String(doc.authorUserId);
    const author = byId.get(authorId) ?? {
      id: authorId,
      name: "Member",
      callsign: null,
    };
    return {
      id: String(doc._id),
      body: doc.body ?? "",
      status: (doc.status as ArticleCommentStatus) || "published",
      createdAt: doc.createdAt
        ? new Date(doc.createdAt).toISOString()
        : new Date().toISOString(),
      author,
      isOwn: Boolean(userId) && authorId === userId,
    };
  });
}

export type AdminCommentRow = {
  id: string;
  body: string;
  status: ArticleCommentStatus;
  createdAt: string;
  articleId: string;
  articleTitle: string;
  articleSlug: string | null;
  authorName: string;
  authorEmail: string;
};

export async function listAdminArticleComments(params?: {
  status?: ArticleCommentStatus | "all";
  limit?: number;
}): Promise<AdminCommentRow[]> {
  const page = await listAdminArticleCommentsPage({
    status: params?.status,
    page: 1,
    pageSize: Math.min(Math.max(params?.limit ?? 100, 1), 300),
  });
  return page.items;
}

export type CommentsAdminPage = {
  items: AdminCommentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listAdminArticleCommentsPage(params?: {
  status?: ArticleCommentStatus | "all";
  page?: number;
  pageSize?: number;
}): Promise<CommentsAdminPage> {
  await connectDb();
  const status = params?.status ?? "pending";
  const filter: Record<string, unknown> = { deletedAt: null };
  if (status !== "all") filter.status = status;

  const total = await ArticleComment.countDocuments(filter);
  const meta = normalizeAdminJobsPage(
    params?.page ?? 1,
    params?.pageSize ?? ADMIN_JOBS_DEFAULT_PAGE_SIZE,
    total,
  );

  const docs = await ArticleComment.find(filter)
    .sort({ createdAt: -1 })
    .skip((meta.page - 1) * meta.pageSize)
    .limit(meta.pageSize)
    .lean();

  const articleIds = [
    ...new Set(docs.map((doc) => String(doc.articleId)).filter(Boolean)),
  ];
  const authorIds = [
    ...new Set(docs.map((doc) => String(doc.authorUserId)).filter(Boolean)),
  ];

  const [articles, authors] = await Promise.all([
    articleIds.length
      ? Article.find({ _id: { $in: articleIds } })
          .select({ "locales.vi.title": 1, "locales.en.title": 1, "locales.vi.slug": 1, "locales.en.slug": 1 })
          .lean()
      : [],
    authorIds.length
      ? User.find({ _id: { $in: authorIds } })
          .select({ name: 1, email: 1 })
          .lean()
      : [],
  ]);

  const articleById = new Map(
    articles.map((article) => {
      const title =
        article.locales?.vi?.title?.trim() ||
        article.locales?.en?.title?.trim() ||
        "Untitled";
      const slug =
        article.locales?.vi?.slug?.trim() ||
        article.locales?.en?.slug?.trim() ||
        null;
      return [
        String(article._id),
        { title, slug },
      ] as const;
    }),
  );
  const authorById = new Map(
    authors.map((user) => [
      String(user._id),
      {
        name: user.name?.trim() || "Member",
        email: user.email?.trim() || "",
      },
    ]),
  );

  return {
    items: docs.map((doc) => {
      const article = articleById.get(String(doc.articleId));
      const author = authorById.get(String(doc.authorUserId));
      return {
        id: String(doc._id),
        body: doc.body ?? "",
        status: (doc.status as ArticleCommentStatus) || "pending",
        createdAt: doc.createdAt
          ? new Date(doc.createdAt).toISOString()
          : new Date().toISOString(),
        articleId: String(doc.articleId),
        articleTitle: article?.title ?? "Article",
        articleSlug: article?.slug ?? null,
        authorName: author?.name ?? "Member",
        authorEmail: author?.email ?? "",
      };
    }),
    ...meta,
  };
}

export function viewerCanPostComments(params: {
  siteEnabled: boolean;
  mode: ArticleCommentsMode;
  canView: boolean;
  signedIn: boolean;
}): boolean {
  return (
    params.siteEnabled &&
    params.mode !== "off" &&
    params.canView &&
    params.signedIn
  );
}

export { contentViewerFromSession, canViewPublishedContent };
