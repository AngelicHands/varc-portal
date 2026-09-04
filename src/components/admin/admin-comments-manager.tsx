"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckIcon,
  TrashIcon,
  XIcon,
} from "@/components/admin/admin-action-icons";
import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import {
  IconActionButton,
  RowActionsGroup,
} from "@/components/admin/icon-action-button";
import {
  approveArticleCommentAction,
  deleteArticleCommentAction,
  rejectArticleCommentAction,
} from "@/lib/actions";
import type { AdminCommentRow } from "@/lib/article-comments";
import {
  notifyAction,
  notifyError,
  notifySuccess,
} from "@/components/admin/admin-toast";
import { useConfirm } from "@/components/admin/use-confirm";
import { PORTAL_TIMEZONE } from "@/lib/datetime-local";

type StatusFilter = "pending" | "published" | "rejected" | "all";
type CommentAction = "approve" | "reject" | "delete";

type Props = {
  comments: AdminCommentRow[];
  statusFilter: StatusFilter;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "published", label: "Published" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

function formatAdminDate(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: PORTAL_TIMEZONE,
  });
}

function statusHref(status: StatusFilter) {
  return status === "pending"
    ? "/admin/comments"
    : `/admin/comments?status=${status}`;
}

function confirmCopy(action: CommentAction, count = 1) {
  const plural = count === 1 ? "comment" : "comments";
  if (action === "approve") {
    return {
      title: count === 1 ? "Approve comment" : "Approve comments",
      message:
        count === 1
          ? "Publish this comment on the article?"
          : `Publish ${count} selected ${plural}?`,
      confirmLabel: count === 1 ? "Approve" : `Approve ${count}`,
      variant: "default" as const,
    };
  }
  if (action === "reject") {
    return {
      title: count === 1 ? "Reject comment" : "Reject comments",
      message:
        count === 1
          ? "Reject this comment? It will no longer appear publicly."
          : `Reject ${count} selected ${plural}? They will no longer appear publicly.`,
      confirmLabel: count === 1 ? "Reject" : `Reject ${count}`,
      variant: "danger" as const,
    };
  }
  return {
    title: count === 1 ? "Delete comment" : "Delete comments",
    message:
      count === 1
        ? "Delete this comment permanently? This cannot be undone."
        : `Delete ${count} selected ${plural} permanently? This cannot be undone.`,
    confirmLabel: count === 1 ? "Delete" : `Delete ${count}`,
    variant: "danger" as const,
  };
}

export function AdminCommentsManager({
  comments,
  statusFilter,
  page,
  pageSize,
  total,
  totalPages,
}: Props) {
  const router = useRouter();
  const { ask, modal } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return comments;
    return comments.filter((comment) => {
      const haystack = [
        comment.body,
        comment.articleTitle,
        comment.authorName,
        comment.authorEmail,
        comment.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [comments, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const selectedCount = selectedIds.size;
  const selectedPendingCount = comments.filter(
    (c) => selectedIds.has(c.id) && c.status === "pending",
  ).length;

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const comment of filtered) next.delete(comment.id);
      } else {
        for (const comment of filtered) next.add(comment.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function run(action: CommentAction, commentId: string) {
    const confirmed = await ask(confirmCopy(action));
    if (!confirmed) return;

    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveArticleCommentAction({ commentId })
          : action === "reject"
            ? await rejectArticleCommentAction({ commentId })
            : await deleteArticleCommentAction({ commentId });
      if (
        !notifyAction(
          result,
          action === "approve"
            ? "Comment approved"
            : action === "reject"
              ? "Comment rejected"
              : "Comment deleted",
        )
      ) {
        return;
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
      router.refresh();
    });
  }

  async function runBulk(action: CommentAction) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    const targets =
      action === "delete"
        ? ids
        : ids.filter((id) => {
            const row = comments.find((c) => c.id === id);
            return row?.status === "pending";
          });

    if (targets.length === 0) {
      notifyError("No pending comments in the selection");
      return;
    }

    const confirmed = await ask(confirmCopy(action, targets.length));
    if (!confirmed) return;

    startTransition(async () => {
      let failed = 0;
      for (const commentId of targets) {
        const result =
          action === "approve"
            ? await approveArticleCommentAction({ commentId })
            : action === "reject"
              ? await rejectArticleCommentAction({ commentId })
              : await deleteArticleCommentAction({ commentId });
        if (!result.ok) failed += 1;
      }

      if (failed > 0) {
        notifyError(
          `Failed on ${failed} of ${targets.length} comment${targets.length === 1 ? "" : "s"}`,
        );
      } else {
        notifySuccess(
          action === "approve"
            ? `Approved ${targets.length} comment${targets.length === 1 ? "" : "s"}`
            : action === "reject"
              ? `Rejected ${targets.length} comment${targets.length === 1 ? "" : "s"}`
              : `Deleted ${targets.length} comment${targets.length === 1 ? "" : "s"}`,
        );
      }
      clearSelection();
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search comments…"
            className="min-w-[16rem] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            aria-label="Search comments"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="whitespace-nowrap font-medium">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                clearSelection();
                router.push(statusHref(e.target.value as StatusFilter));
              }}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-sm text-gray-700">
              {selectedCount} selected
              {selectedPendingCount > 0
                ? ` · ${selectedPendingCount} pending`
                : ""}
            </p>
            <div className="flex items-center gap-1.5">
              <IconActionButton
                label="Approve selected"
                disabled={pending || selectedPendingCount === 0}
                variant="success"
                onClick={() => {
                  void runBulk("approve");
                }}
              >
                <CheckIcon />
              </IconActionButton>
              <IconActionButton
                label="Reject selected"
                disabled={pending || selectedPendingCount === 0}
                variant="danger"
                onClick={() => {
                  void runBulk("reject");
                }}
              >
                <XIcon />
              </IconActionButton>
              <IconActionButton
                label="Delete selected"
                disabled={pending}
                variant="danger"
                onClick={() => {
                  void runBulk("delete");
                }}
              >
                <TrashIcon />
              </IconActionButton>
              <button
                type="button"
                disabled={pending}
                onClick={clearSelection}
                className="ml-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="w-10 px-4 py-3">
                  <AdminCheckbox
                    checked={allFilteredSelected}
                    aria-label="Select all comments"
                    onChange={toggleAllFiltered}
                    disabled={filtered.length === 0}
                  />
                </th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Article</th>
                <th className="px-4 py-3 font-medium">Commented by</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Comment</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-gray-600"
                  >
                    {comments.length === 0
                      ? "No comments in this filter."
                      : "No comments match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((comment) => {
                  const checked = selectedIds.has(comment.id);
                  return (
                    <tr
                      key={comment.id}
                      className={`border-t border-gray-100 align-top ${
                        checked ? "bg-gray-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <AdminCheckbox
                          checked={checked}
                          aria-label={`Select comment by ${comment.authorName}`}
                          onChange={() => toggleOne(comment.id)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatAdminDate(comment.createdAt)}
                      </td>
                      <td className="max-w-[12rem] px-4 py-3">
                        <Link
                          href={`/admin/articles/${comment.articleId}`}
                          title={comment.articleTitle}
                          className="block truncate font-medium text-gray-900 underline"
                        >
                          {comment.articleTitle}
                        </Link>
                        {comment.articleSlug ? (
                          <div className="mt-1">
                            <Link
                              href={`/vi/news/${comment.articleSlug}`}
                              className="text-xs text-gray-500 underline"
                              target="_blank"
                            >
                              View
                            </Link>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <div>{comment.authorName}</div>
                        <div className="text-xs text-gray-500">
                          {comment.authorEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-700">
                        {comment.status}
                      </td>
                      <td className="max-w-md px-4 py-3 text-gray-800">
                        <p className="whitespace-pre-wrap break-words">
                          {comment.body}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <RowActionsGroup>
                          {comment.status === "pending" ? (
                            <>
                              <IconActionButton
                                label="Approve"
                                disabled={pending}
                                variant="success"
                                onClick={() => {
                                  void run("approve", comment.id);
                                }}
                              >
                                <CheckIcon />
                              </IconActionButton>
                              <IconActionButton
                                label="Reject"
                                disabled={pending}
                                variant="danger"
                                onClick={() => {
                                  void run("reject", comment.id);
                                }}
                              >
                                <XIcon />
                              </IconActionButton>
                            </>
                          ) : null}
                          <IconActionButton
                            label="Delete"
                            disabled={pending}
                            variant="danger"
                            onClick={() => {
                              void run("delete", comment.id);
                            }}
                          >
                            <TrashIcon />
                          </IconActionButton>
                        </RowActionsGroup>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <AdminListPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            label="Comments"
          />
        </div>
      </div>
      {modal}
    </>
  );
}
