import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const ARTICLE_COMMENT_STATUSES = [
  "pending",
  "published",
  "rejected",
] as const;
export type ArticleCommentStatus = (typeof ARTICLE_COMMENT_STATUSES)[number];

const ArticleCommentSchema = new Schema(
  {
    articleId: {
      type: Schema.Types.ObjectId,
      ref: "Article",
      required: true,
      index: true,
    },
    authorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    body: { type: String, required: true, trim: true, maxlength: 4_000 },
    status: {
      type: String,
      enum: ARTICLE_COMMENT_STATUSES,
      default: "pending",
      index: true,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

ArticleCommentSchema.index({ articleId: 1, status: 1, createdAt: -1 });
ArticleCommentSchema.index({ status: 1, createdAt: -1 });

export type ArticleCommentDocument = InferSchemaType<
  typeof ArticleCommentSchema
> & {
  _id: mongoose.Types.ObjectId;
};

if (mongoose.models.ArticleComment) {
  delete mongoose.models.ArticleComment;
}

export const ArticleComment: Model<ArticleCommentDocument> =
  mongoose.model<ArticleCommentDocument>(
    "ArticleComment",
    ArticleCommentSchema,
  );
