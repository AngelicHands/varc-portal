import { z } from "zod";

export const ARTICLE_COMMENTS_MODES = ["off", "open", "moderated"] as const;
export type ArticleCommentsMode = (typeof ARTICLE_COMMENTS_MODES)[number];

export const createArticleCommentSchema = z.object({
  articleId: z.string().trim().min(1).max(64),
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(4_000, "Comment is too long"),
});

export type CreateArticleCommentInput = z.infer<
  typeof createArticleCommentSchema
>;

export const articleCommentIdSchema = z.object({
  commentId: z.string().trim().min(1).max(64),
});
