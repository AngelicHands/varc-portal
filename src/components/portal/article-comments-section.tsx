"use client";

import { useState, useTransition, type FormEvent } from "react";
import NextLink from "next/link";
import {
  CheckIcon,
  SendIcon,
  TrashIcon,
  XIcon,
} from "@/components/admin/admin-action-icons";
import { useConfirm } from "@/components/admin/use-confirm";
import {
  approveArticleCommentAction,
  createArticleCommentAction,
  deleteArticleCommentAction,
  rejectArticleCommentAction,
} from "@/lib/actions";
import type { PublicArticleComment } from "@/lib/article-comments";
import { formatDateUtc7 } from "@/lib/datetime-local";
import type { AppLocale } from "@/i18n/routing";

type Props = {
  articleId: string;
  locale: AppLocale;
  articlePath: string;
  initialComments: PublicArticleComment[];
  canPost: boolean;
  canModerate: boolean;
  signedIn: boolean;
  labels: {
    title: string;
    empty: string;
    placeholder: string;
    submit: string;
    submitting: string;
    signInToComment: string;
    pending: string;
    approve: string;
    reject: string;
    delete: string;
    posted: string;
  };
};

const actionBtn =
  "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-50";

export function ArticleCommentsSection({
  articleId,
  locale,
  articlePath,
  initialComments,
  canPost,
  canModerate,
  signedIn,
  labels,
}: Props) {
  const { ask, modal } = useConfirm();
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function formatWhen(iso: string) {
    return formatDateUtc7(iso, locale === "vi" ? "vi-VN" : "en-GB");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createArticleCommentAction({
        articleId,
        body: trimmed,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      window.location.reload();
    });
  }

  async function runModeration(
    action: "approve" | "reject" | "delete",
    commentId: string,
  ) {
    const confirmed = await ask(
      action === "approve"
        ? {
            theme: "portal",
            title: labels.approve,
            message: "Publish this comment on the article?",
            confirmLabel: labels.approve,
            variant: "default",
          }
        : action === "reject"
          ? {
              theme: "portal",
              title: labels.reject,
              message:
                "Reject this comment? It will no longer appear publicly.",
              confirmLabel: labels.reject,
              variant: "danger",
            }
          : {
              theme: "portal",
              title: labels.delete,
              message:
                "Delete this comment permanently? This cannot be undone.",
              confirmLabel: labels.delete,
              variant: "danger",
            },
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveArticleCommentAction({ commentId })
          : action === "reject"
            ? await rejectArticleCommentAction({ commentId })
            : await deleteArticleCommentAction({ commentId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (action === "delete" || action === "reject") {
        setComments((current) => current.filter((c) => c.id !== commentId));
      } else {
        setComments((current) =>
          current.map((c) =>
            c.id === commentId ? { ...c, status: "published" } : c,
          ),
        );
      }
    });
  }

  return (
    <section className="mt-12 border-t border-border pt-10">
      <h2 className="font-display text-2xl text-foreground">{labels.title}</h2>

      {canPost ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder={labels.placeholder}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            disabled={pending}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <SendIcon className="h-4 w-4" />
              {pending ? labels.submitting : labels.submit}
            </button>
          </div>
        </form>
      ) : !signedIn ? (
        <p className="mt-4 text-sm text-muted">
          <NextLink
            href={`/admin/login?callbackUrl=${encodeURIComponent(articlePath)}`}
            className="font-medium text-accent underline"
          >
            {labels.signInToComment}
          </NextLink>
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {comments.length === 0 ? (
        <p className="mt-8 text-sm text-muted">{labels.empty}</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-lg border border-border bg-surface/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {comment.author.callsign
                    ? `${comment.author.name} (${comment.author.callsign})`
                    : comment.author.name}
                </p>
                <time
                  dateTime={comment.createdAt}
                  className="text-xs text-muted"
                >
                  {labels.posted} {formatWhen(comment.createdAt)}
                </time>
              </div>
              {comment.status === "pending" ? (
                <p className="mt-1 text-xs font-medium text-amber-700">
                  {labels.pending}
                </p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {comment.body}
              </p>
              {(canModerate || comment.isOwn) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {canModerate && comment.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          void runModeration("approve", comment.id);
                        }}
                        className={`${actionBtn} border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                        {labels.approve}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          void runModeration("reject", comment.id);
                        }}
                        className={`${actionBtn} border-red-200 bg-white text-red-700 hover:bg-red-50`}
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        {labels.reject}
                      </button>
                    </>
                  ) : null}
                  {(canModerate || comment.isOwn) && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        void runModeration("delete", comment.id);
                      }}
                      className={`${actionBtn} border-red-200 bg-white text-red-700 hover:bg-red-50`}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      {labels.delete}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {modal}
    </section>
  );
}
