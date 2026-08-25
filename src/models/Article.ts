import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  ARTICLE_CONTENT_SOURCES,
  type ArticleContentSource,
} from "@/lib/article-content-source";

export type { ArticleContentSource };
export { ARTICLE_CONTENT_SOURCES };

const LocaleContentSchema = new Schema(
  {
    title: { type: String, default: "" },
    slug: { type: String, default: "" },
    excerpt: { type: String, default: "" },
    content: { type: String, default: "" },
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
  },
  { _id: false },
);

const ArticleSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    categoryIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Category" }],
      default: [],
    },
    tags: {
      type: [{ type: String, trim: true }],
      default: [],
    },
    coverImageUrl: { type: String, default: "" },
    /** Focal point for object-position when cover is cropped (0–100%). */
    coverImageFocus: {
      type: Schema.Types.Mixed,
      default: () => ({ x: 50, y: 50 }),
    },
    ogImageUrl: { type: String, default: "" },
    featured: { type: Boolean, default: false, index: true },
    /** Anonymous/public viewers may open the published article. Default true. */
    allowPublic: { type: Boolean, default: true, index: true },
    /** When private: empty = all authenticated users. */
    allowedUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    /** When private: empty = all roles. Matched against User.role keys. */
    allowedRoleKeys: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: [],
    },
    /** Where article content is authored: CMS UI or Git sync import. */
    contentSource: {
      type: String,
      enum: ARTICLE_CONTENT_SOURCES,
      default: "cms",
      index: true,
    },
    deletedAt: { type: Date, default: null, index: true },
    locales: {
      vi: { type: LocaleContentSchema, required: true },
      en: { type: LocaleContentSchema, required: true },
    },
  },
  { timestamps: true },
);

ArticleSchema.index(
  { "locales.vi.slug": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "locales.vi.slug": { $type: "string", $gt: "" },
      deletedAt: null,
    },
  },
);
ArticleSchema.index(
  { "locales.en.slug": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "locales.en.slug": { $type: "string", $gt: "" },
      deletedAt: null,
    },
  },
);
ArticleSchema.index({ status: 1, publishedAt: -1 });
ArticleSchema.index({ status: 1, featured: 1, publishedAt: -1 });
ArticleSchema.index({ categoryIds: 1 });
ArticleSchema.index({ tags: 1 });

export type LocaleContent = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
};

export type ArticleDocument = InferSchemaType<typeof ArticleSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Article: Model<ArticleDocument> =
  mongoose.models.Article ??
  mongoose.model<ArticleDocument>("Article", ArticleSchema);
