import { Suspense } from "react";
import Link from "next/link";
import mongoose from "mongoose";
import {
  countArticles,
  getLocaleContent,
  hasLocaleContent,
  listArticlesAdminPage,
} from "@/lib/articles";
import { listCategories, getCategoryLocale } from "@/lib/cms";
import {
  deleteArticleAction,
  restoreArticleAction,
  permanentlyDeleteArticleAction,
  emptyArticlesTrashAction,
  cloneArticleAction,
} from "@/lib/actions";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { AdminListTabs } from "@/components/admin/admin-list-tabs";
import { AdminLocaleStatus } from "@/components/admin/admin-locale-status";
import { ActiveRowActions } from "@/components/admin/active-row-actions";
import { TrashRowActions } from "@/components/admin/trash-row-actions";
import { EmptyTrashButton } from "@/components/admin/empty-trash-button";
import { AdminAuthorAvatar } from "@/components/admin/admin-author-avatar";
import { requireEditorialPage } from "@/lib/admin-access";
import {
  parseAdminJobsPage,
  parseAdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";
import { PORTAL_TIMEZONE, isFuturePublishAt } from "@/lib/datetime-local";
import { connectDb } from "@/lib/db";
import { profileAvatarUrl } from "@/lib/gravatar";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string; page?: string; pageSize?: string }>;
};

function clipWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function clipSlug(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const words = trimmed.split(/[-_\s]+/).filter(Boolean);
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join("-")}…`;
}

function isFuturePublish(
  publishedAt: Date | string | null | undefined,
  now: Date,
): boolean {
  return isFuturePublishAt(publishedAt, now);
}

function formatAdminDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: PORTAL_TIMEZONE,
  });
}

function formatAdminDateShort(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("vi-VN", {
    timeZone: PORTAL_TIMEZONE,
  });
}

function statusClassName(
  status: string,
  publishedAt: Date | string | null | undefined,
  now: Date,
) {
  if (status === "published") {
    return isFuturePublish(publishedAt, now) ? "text-sky-700" : "text-green-700";
  }
  return "text-amber-700";
}

function statusLabel(
  status: string,
  publishedAt: Date | string | null | undefined,
  now: Date,
) {
  if (status === "published" && isFuturePublish(publishedAt, now)) {
    return "scheduled";
  }
  return status;
}

type AuthorDisplay = {
  label: string;
  avatarUrl: string | null;
};

function formatAuthorLabel(author: {
  name?: string | null;
  callsign?: string | null;
  email?: string | null;
}) {
  const name = author.name?.trim();
  if (name) return name;
  const callsign = author.callsign?.trim();
  if (callsign) return callsign;
  const email = author.email?.trim();
  if (email) return email;
  return "—";
}

function AuthorCell({
  author,
  compact = false,
}: {
  author: AuthorDisplay | null;
  compact?: boolean;
}) {
  const label = author?.label ?? "—";
  const avatarUrl = author?.avatarUrl ?? null;

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <AdminAuthorAvatar src={avatarUrl} label={label} compact={compact} />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

export default async function AdminArticlesPage({ searchParams }: Props) {
  await requireEditorialPage();
  const now = new Date();

  const params = await searchParams;
  const trash = params.tab === "trash";
  const page = parseAdminJobsPage(params.page);
  const pageSize = parseAdminJobsPageSize(params.pageSize);

  const [activeCount, trashCount, listPage, activeCategories, trashCategories] =
    await Promise.all([
      countArticles(),
      countArticles({ trash: true }),
      listArticlesAdminPage({ trash, page, pageSize }),
      listCategories(),
      listCategories({ trash: true }),
    ]);
  const articles = listPage.items;

  const categoryNameById = new Map<string, string>();
  for (const category of [...activeCategories, ...trashCategories]) {
    const name =
      getCategoryLocale(category, "vi").name ||
      getCategoryLocale(category, "en").name;
    if (name) categoryNameById.set(String(category._id), name);
  }

  const authorIds = [
    ...new Set(
      articles
        .map((article) => String(article.authorId ?? ""))
        .filter((id) => mongoose.isValidObjectId(id)),
    ),
  ];
  await connectDb();
  const authors = authorIds.length
    ? await User.find({ _id: { $in: authorIds } })
        .select("name callsign email image")
        .lean<
          Array<{
            _id: mongoose.Types.ObjectId;
            name?: string;
            callsign?: string;
            email?: string;
            image?: string | null;
          }>
        >()
    : [];
  const authorById = new Map<string, AuthorDisplay>(
    authors.map((author) => [
      String(author._id),
      {
        label: formatAuthorLabel(author),
        avatarUrl: profileAvatarUrl(author.image, author.email, 64, {
          defaultImage: "404",
        }),
      },
    ]),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Articles</h1>
        {trash ? (
          <EmptyTrashButton
            count={trashCount}
            itemLabel="articles"
            emptyAction={emptyArticlesTrashAction}
          />
        ) : (
          <Link
            href="/admin/articles/new"
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            New article
          </Link>
        )}
      </div>

      <AdminListTabs
        basePath="/admin/articles"
        active={trash ? "trash" : "active"}
        activeCount={activeCount}
        trashCount={trashCount}
      />

      {listPage.total === 0 ? (
        <p className="mt-8 text-gray-600">
          {trash ? "Trash is empty." : "No articles yet."}
        </p>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="mt-6 space-y-3 md:hidden">
            {articles.map((article) => {
              const vi = getLocaleContent(article, "vi");
              const id = String(article._id);
              const categoryNames = (article.categoryIds ?? [])
                .map((categoryId) => categoryNameById.get(String(categoryId)))
                .filter(Boolean);
              const dateValue = trash ? article.deletedAt : article.updatedAt;
              const author =
                authorById.get(String(article.authorId ?? "")) ?? null;

              return (
                <li
                  key={id}
                  className="rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {!trash ? (
                        <Link
                          href={`/admin/articles/${id}`}
                          className="block font-medium text-gray-900 hover:underline"
                        >
                          {clipWords(vi.title || "(untitled)", 20)}
                        </Link>
                      ) : (
                        <p className="font-medium text-gray-900">
                          {clipWords(vi.title || "(untitled)", 20)}
                        </p>
                      )}
                      <p className="mt-0.5 truncate font-mono text-xs text-gray-500">
                        {vi.slug ? clipSlug(vi.slug, 15) : "—"}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {trash ? (
                        <TrashRowActions
                          restoreAction={restoreArticleAction.bind(null, id)}
                          deleteAction={permanentlyDeleteArticleAction.bind(
                            null,
                            id,
                          )}
                          itemLabel={vi.title || "this article"}
                        />
                      ) : (
                        <ActiveRowActions
                          editHref={`/admin/articles/${id}`}
                          cloneAction={cloneArticleAction.bind(null, id)}
                          deleteAction={deleteArticleAction.bind(null, id)}
                          deleteConfirmMessage="Move this article to trash?"
                        />
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-600">
                    <span
                      className={`font-medium capitalize ${statusClassName(
                        article.status,
                        article.publishedAt,
                        now,
                      )}`}
                    >
                      {statusLabel(article.status, article.publishedAt, now)}
                    </span>
                    <AdminLocaleStatus
                      viReady={hasLocaleContent(article, "vi")}
                      enReady={hasLocaleContent(article, "en")}
                    />
                    <span className="min-w-0">
                      <AuthorCell author={author} compact />
                    </span>
                    {categoryNames.length > 0 ? (
                      <span className="min-w-0 truncate">
                        {categoryNames.join(", ")}
                      </span>
                    ) : null}
                    <span className="text-gray-500">
                      {trash ? "Deleted" : "Updated"}{" "}
                      {formatAdminDateShort(dateValue)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="mt-6 hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Title (VI)</th>
                  <th className="px-4 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Languages</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">
                    {trash ? "Deleted" : "Updated"}
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => {
                  const vi = getLocaleContent(article, "vi");
                  const id = String(article._id);
                  const categoryNames = (article.categoryIds ?? [])
                    .map((categoryId) =>
                      categoryNameById.get(String(categoryId)),
                    )
                    .filter(Boolean);
                  const author =
                    authorById.get(String(article.authorId ?? "")) ?? null;
                  return (
                    <tr
                      key={id}
                      className={`relative border-b border-gray-100 ${
                        trash ? "" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        {!trash ? (
                          <Link
                            href={`/admin/articles/${id}`}
                            className="absolute inset-0 z-0"
                            aria-label={`Edit ${vi.title || "article"}`}
                          />
                        ) : null}
                        <div className="relative z-10 pointer-events-none">
                          <div className="font-medium text-gray-900">
                            {clipWords(vi.title || "(untitled)", 20)}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-gray-500">
                            {vi.slug ? clipSlug(vi.slug, 15) : "—"}
                          </div>
                        </div>
                      </td>
                      <td className="relative z-10 pointer-events-none px-4 py-3 text-gray-600">
                        <AuthorCell author={author} />
                      </td>
                      <td className="relative z-10 pointer-events-none px-4 py-3 text-gray-600">
                        {categoryNames.length > 0
                          ? categoryNames.join(", ")
                          : "—"}
                      </td>
                      <td className="relative z-10 pointer-events-none px-4 py-3">
                        <AdminLocaleStatus
                          viReady={hasLocaleContent(article, "vi")}
                          enReady={hasLocaleContent(article, "en")}
                        />
                      </td>
                      <td className="relative z-10 pointer-events-none px-4 py-3">
                        <span
                          className={statusClassName(
                            article.status,
                            article.publishedAt,
                            now,
                          )}
                        >
                          {statusLabel(
                            article.status,
                            article.publishedAt,
                            now,
                          )}
                        </span>
                      </td>
                      <td className="relative z-10 pointer-events-none px-4 py-3 text-gray-500">
                        {formatAdminDate(
                          trash ? article.deletedAt : article.updatedAt,
                        )}
                      </td>
                      <td className="relative z-10 px-4 py-3 text-right">
                        {trash ? (
                          <TrashRowActions
                            restoreAction={restoreArticleAction.bind(null, id)}
                            deleteAction={permanentlyDeleteArticleAction.bind(
                              null,
                              id,
                            )}
                            itemLabel={vi.title || "this article"}
                          />
                        ) : (
                          <ActiveRowActions
                            editHref={`/admin/articles/${id}`}
                            cloneAction={cloneArticleAction.bind(null, id)}
                            deleteAction={deleteArticleAction.bind(null, id)}
                            deleteConfirmMessage="Move this article to trash?"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Suspense fallback={null}>
              <AdminListPagination
                page={listPage.page}
                pageSize={listPage.pageSize}
                total={listPage.total}
                totalPages={listPage.totalPages}
                label="Articles"
              />
            </Suspense>
          </div>

          <div className="md:hidden">
            <Suspense fallback={null}>
              <AdminListPagination
                page={listPage.page}
                pageSize={listPage.pageSize}
                total={listPage.total}
                totalPages={listPage.totalPages}
                label="Articles"
              />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}
