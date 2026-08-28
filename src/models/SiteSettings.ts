import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const SiteLocaleSchema = new Schema(
  {
    siteName: { type: String, default: "" },
    siteTitle: { type: String, default: "" },
    tagline: { type: String, default: "" },
    copyright: { type: String, default: "" },
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
  },
  { _id: false },
);

const GoogleAnalyticsSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    provider: { type: String, enum: ["ga4", "gtm"], default: "ga4" },
    measurementId: { type: String, default: "", trim: true },
    containerId: { type: String, default: "", trim: true },
    debugMode: { type: Boolean, default: false },
  },
  { _id: false },
);

const SiteSettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    logoUrl: { type: String, default: "" },
    faviconUrl: { type: String, default: "" },
    ogImageUrl: { type: String, default: "" },
    /** CMS page id to render at `/` (optional). */
    homePageId: { type: Schema.Types.ObjectId, ref: "Page", default: null },
    homeTemplateKey: { type: String, default: "home", trim: true },
    articleTemplateKey: { type: String, default: "article", trim: true },
    categoryTemplateKey: { type: String, default: "category", trim: true },
    /** Master switch for article comments site-wide. */
    articleCommentsEnabled: { type: Boolean, default: false },
    googleAnalytics: {
      type: GoogleAnalyticsSchema,
      default: () => ({}),
    },
    locales: {
      vi: { type: SiteLocaleSchema, required: true },
      en: { type: SiteLocaleSchema, required: true },
    },
  },
  { timestamps: true },
);

export type SiteLocaleContent = {
  siteName: string;
  siteTitle: string;
  tagline: string;
  copyright: string;
  metaTitle: string;
  metaDescription: string;
};

export type GoogleAnalyticsSettings = {
  enabled: boolean;
  provider: "ga4" | "gtm";
  measurementId: string;
  containerId: string;
  debugMode: boolean;
};

export type SiteSettingsDocument = InferSchemaType<typeof SiteSettingsSchema> & {
  _id: mongoose.Types.ObjectId;
};

// Recompile on HMR so new fields (e.g. articleCommentsEnabled) take effect in dev.
if (mongoose.models.SiteSettings) {
  delete mongoose.models.SiteSettings;
}

export const SiteSettings: Model<SiteSettingsDocument> =
  mongoose.model<SiteSettingsDocument>("SiteSettings", SiteSettingsSchema);

export const SITE_SETTINGS_KEY = "default";
