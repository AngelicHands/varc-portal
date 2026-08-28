import { z } from "zod";
import { isEmptyHtml, sanitizeHtml } from "@/lib/html";
import { isSafePublicUrl } from "@/lib/safe-url";
import { adminCallsignSchema } from "@/lib/validations/qso";

const MAX_HTML_CHARS = 500_000;
const MAX_TEXT_CHARS = 5_000;
const MAX_PASSWORD_CHARS = 128;

const safeUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine(isSafePublicUrl, {
    message: "URL must be http(s) or a site-relative path",
  });

const articleLocaleSchema = z.object({
  title: z.string().trim().max(MAX_TEXT_CHARS),
  excerpt: z.string().trim().max(MAX_TEXT_CHARS),
  content: z.string().max(MAX_HTML_CHARS),
  metaTitle: z.string().trim().max(MAX_TEXT_CHARS),
  metaDescription: z.string().trim().max(MAX_TEXT_CHARS),
});

const articleFormFieldsSchema = z.object({
  status: z.enum(["draft", "published"]),
  featured: z.boolean(),
  commentsMode: z.enum(["off", "open", "moderated"]).default("off"),
  allowPublic: z.boolean().default(true),
  allowedUserIds: z.array(z.string().max(64)).max(200).default([]),
  allowedRoleKeys: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  coverImageUrl: safeUrlSchema,
  coverImageFocus: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().min(1).max(100),
    height: z.number().min(1).max(100),
  }),
  ogImageUrl: safeUrlSchema,
  categoryIds: z.array(z.string().max(64)).max(50),
  tags: z.array(z.string().trim().min(1).max(64)).max(30),
  /** ISO datetime string, or null when unset / draft. */
  publishedAt: z.string().datetime().nullable(),
  /** ISO datetime string, or null to keep server default. */
  createdAt: z.string().datetime().nullable(),
  locales: z.object({
    vi: articleLocaleSchema,
    en: articleLocaleSchema,
  }),
});

function sanitizeArticleLocales<
  T extends {
    locales: {
      vi: { content: string };
      en: { content: string };
    };
  },
>(data: T) {
  return {
    ...data,
    locales: {
      vi: {
        ...data.locales.vi,
        content: sanitizeHtml(data.locales.vi.content),
      },
      en: {
        ...data.locales.en,
        content: sanitizeHtml(data.locales.en.content),
      },
    },
  };
}

export const articleFormSchema = articleFormFieldsSchema
  .superRefine((data, ctx) => {
    if (data.status !== "published") return;

    if (!data.locales.vi.title) {
      ctx.addIssue({
        code: "custom",
        message: "Vietnamese title is required to publish",
        path: ["locales", "vi", "title"],
      });
    }
    if (isEmptyHtml(data.locales.vi.content)) {
      ctx.addIssue({
        code: "custom",
        message: "Vietnamese content is required to publish",
        path: ["locales", "vi", "content"],
      });
    }
  })
  .transform(sanitizeArticleLocales);

/** Auto-save: same fields, no publish requirements; status is ignored on update. */
export const articleAutoSaveSchema =
  articleFormFieldsSchema.transform(sanitizeArticleLocales);

export type ArticleFormValues = z.input<typeof articleFormSchema>;
export type ArticleAutoSaveValues = z.infer<typeof articleAutoSaveSchema>;

export function hasMinimalArticleContent(
  data: Pick<ArticleFormValues, "locales">,
): boolean {
  const vi = data.locales.vi;
  const en = data.locales.en;
  return (
    Boolean(vi.title.trim()) ||
    Boolean(en.title.trim()) ||
    !isEmptyHtml(vi.content) ||
    !isEmptyHtml(en.content)
  );
}

const categoryLocaleSchema = z.object({
  name: z.string().trim().max(MAX_TEXT_CHARS),
  description: z.string().trim().max(MAX_TEXT_CHARS),
});

export const categoryFormSchema = z
  .object({
    parentId: z.string().max(64).nullable().optional(),
    locales: z.object({
      vi: categoryLocaleSchema,
      en: categoryLocaleSchema,
    }),
  })
  .superRefine((data, ctx) => {
    if (!data.locales.vi.name) {
      ctx.addIssue({
        code: "custom",
        message: "Vietnamese name is required",
        path: ["locales", "vi", "name"],
      });
    }
  });

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const emptyCategoryForm: CategoryFormValues = {
  parentId: null,
  locales: {
    vi: { name: "", description: "" },
    en: { name: "", description: "" },
  },
};

export const reorderCategoriesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        parentId: z.string().max(64).nullable(),
        sortOrder: z.number().int().nonnegative().max(10_000),
      }),
    )
    .min(1)
    .max(500),
});

const pageLocaleSchema = z.object({
  title: z.string().trim().max(MAX_TEXT_CHARS),
  content: z.string().max(MAX_HTML_CHARS),
  metaTitle: z.string().trim().max(MAX_TEXT_CHARS),
  metaDescription: z.string().trim().max(MAX_TEXT_CHARS),
});

const pageGalleryItemSchema = z.object({
  mediaId: z.string().trim().min(1).max(64),
  url: safeUrlSchema.refine((v) => v.length > 0, { message: "URL is required" }),
  alt: z.string().trim().max(MAX_TEXT_CHARS),
  originalName: z.string().trim().max(MAX_TEXT_CHARS),
});

export const pageFormSchema = z
  .object({
    status: z.enum(["draft", "published"]),
    allowPublic: z.boolean().default(true),
    allowedUserIds: z.array(z.string().max(64)).max(200).default([]),
    allowedRoleKeys: z
      .array(z.string().trim().min(1).max(64))
      .max(50)
      .default([]),
    templateKey: z.string().trim().min(1).max(100),
    fontFamily: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .transform((value) => value || "default"),
    ogImageUrl: safeUrlSchema,
    /** When set, page uses this layout instead of the template's layout. */
    layoutOverride: z.unknown().nullable().optional(),
    galleryItems: z.array(pageGalleryItemSchema).max(500),
    sortOrder: z.number().int().min(-10_000).max(10_000),
    locales: z.object({
      vi: pageLocaleSchema,
      en: pageLocaleSchema,
    }),
  })
  .superRefine((data, ctx) => {
    if (data.status !== "published") return;
    if (!data.locales.vi.title) {
      ctx.addIssue({
        code: "custom",
        message: "Vietnamese title is required to publish",
        path: ["locales", "vi", "title"],
      });
    }
    if (data.templateKey === "gallery") {
      if (data.galleryItems.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Add at least one gallery image to publish",
          path: ["galleryItems"],
        });
      }
      return;
    }
    if (
      data.templateKey === "blank" ||
      data.templateKey === "home" ||
      data.templateKey === "category"
    ) {
      return;
    }
    if (isEmptyHtml(data.locales.vi.content)) {
      ctx.addIssue({
        code: "custom",
        message: "Vietnamese content is required to publish",
        path: ["locales", "vi", "content"],
      });
    }
  })
  .transform((data) => ({
    ...data,
    locales: {
      vi: {
        ...data.locales.vi,
        content: sanitizeHtml(data.locales.vi.content),
      },
      en: {
        ...data.locales.en,
        content: sanitizeHtml(data.locales.en.content),
      },
    },
  }));

export type PageFormValues = z.input<typeof pageFormSchema>;
export type PageGalleryItemValues = z.infer<typeof pageGalleryItemSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Valid email is required").max(320),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(MAX_PASSWORD_CHARS, "Password is too long"),
  role: z.enum(["setup_admin", "administrator", "editor", "reader"]),
  callsign: adminCallsignSchema.optional().default(""),
  callsignVerified: z.boolean().optional().default(false),
});

export type CreateUserValues = z.infer<typeof createUserSchema>;

export const updateAdminUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  callsign: adminCallsignSchema.optional().default(""),
  callsignVerified: z.boolean().optional(),
});

export type UpdateAdminUserValues = z.infer<typeof updateAdminUserSchema>;

export const roleFormSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(200),
  description: z.string().trim().max(MAX_TEXT_CHARS),
  enabled: z.boolean(),
  canAccessAdmin: z.boolean(),
  canManageContent: z.boolean(),
  canManagePages: z.boolean(),
  canManageSite: z.boolean(),
  canManageUsers: z.boolean(),
  canManageRoles: z.boolean(),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;

const menuLocaleSchema = z.object({
  label: z.string().trim().max(MAX_TEXT_CHARS),
  url: safeUrlSchema,
});

export const menuItemFormSchema = z
  .object({
    location: z.enum(["navigation", "footer"]),
    type: z.enum(["page", "category", "custom"]),
    pageId: z.string().nullable(),
    categoryId: z.string().nullable(),
    parentId: z.string().nullable().optional(),
    locales: z.object({
      vi: menuLocaleSchema,
      en: menuLocaleSchema,
    }),
    enabled: z.boolean(),
    openInNewTab: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "page") {
      if (!data.pageId) {
        ctx.addIssue({
          code: "custom",
          message: "Select a page for this menu item",
          path: ["pageId"],
        });
      }
      return;
    }

    if (data.type === "category") {
      if (!data.categoryId) {
        ctx.addIssue({
          code: "custom",
          message: "Select a category for this menu item",
          path: ["categoryId"],
        });
      }
      return;
    }

    if (!data.locales.vi.label) {
      ctx.addIssue({
        code: "custom",
        message: "Vietnamese label is required",
        path: ["locales", "vi", "label"],
      });
    }
    if (!data.locales.vi.url) {
      ctx.addIssue({
        code: "custom",
        message: "Vietnamese URL is required",
        path: ["locales", "vi", "url"],
      });
    }
  });

export type MenuItemFormValues = z.infer<typeof menuItemFormSchema>;

export const reorderMenuSchema = z.object({
  location: z.enum(["navigation", "footer"]),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        parentId: z.string().max(64).nullable(),
        sortOrder: z.number().int().nonnegative().max(10_000),
      }),
    )
    .min(1)
    .max(500),
});

const siteLocaleSchema = z.object({
  siteName: z.string().trim().max(MAX_TEXT_CHARS),
  siteTitle: z.string().trim().max(MAX_TEXT_CHARS),
  tagline: z.string().trim().max(MAX_TEXT_CHARS),
  copyright: z.string().trim().max(MAX_TEXT_CHARS),
  metaTitle: z.string().trim().max(MAX_TEXT_CHARS),
  metaDescription: z.string().trim().max(MAX_TEXT_CHARS),
});

const requireVietnameseSiteName = (
  data: { locales: { vi: { siteName: string } } },
  ctx: z.RefinementCtx,
) => {
  if (!data.locales.vi.siteName) {
    ctx.addIssue({
      code: "custom",
      message: "Vietnamese site name is required",
      path: ["locales", "vi", "siteName"],
    });
  }
};

export const siteSettingsBrandingSchema = z.object({
  logoUrl: safeUrlSchema,
  faviconUrl: safeUrlSchema,
  ogImageUrl: safeUrlSchema,
});

export const siteSettingsRoutesSchema = z.object({
  /** Optional CMS page rendered at `/` instead of the hardcoded home. */
  homePageId: z.string().trim().max(64).nullable().optional(),
  homeTemplateKey: z.string().trim().max(100).default("home"),
  articleTemplateKey: z.string().trim().max(100).default("article"),
  categoryTemplateKey: z.string().trim().max(100).default("category"),
});

export const siteSettingsSiteSchema = z
  .object({
    locales: z.object({
      vi: siteLocaleSchema,
      en: siteLocaleSchema,
    }),
  })
  .superRefine(requireVietnameseSiteName);

const GA4_MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/;
const GTM_CONTAINER_ID_RE = /^GTM-[A-Z0-9]+$/;

export const googleAnalyticsSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(["ga4", "gtm"]).default("ga4"),
  measurementId: z.string().trim().max(32).default(""),
  containerId: z.string().trim().max(32).default(""),
  debugMode: z.boolean().default(false),
});

const validateGoogleAnalytics = (
  data: z.infer<typeof googleAnalyticsSchema>,
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[] = [],
) => {
  if (!data.enabled) return;

  const path = (...segments: (string | number)[]) => [...pathPrefix, ...segments];

  if (data.provider === "ga4") {
    const id = data.measurementId.trim();
    if (!id) {
      ctx.addIssue({
        code: "custom",
        message: "GA4 Measurement ID is required when analytics is enabled",
        path: path("measurementId"),
      });
      return;
    }
    if (!GA4_MEASUREMENT_ID_RE.test(id)) {
      ctx.addIssue({
        code: "custom",
        message: "GA4 Measurement ID must look like G-XXXXXXXXXX",
        path: path("measurementId"),
      });
    }
    return;
  }

  const id = data.containerId.trim();
  if (!id) {
    ctx.addIssue({
      code: "custom",
      message: "GTM Container ID is required when analytics is enabled",
      path: path("containerId"),
    });
    return;
  }
  if (!GTM_CONTAINER_ID_RE.test(id)) {
    ctx.addIssue({
      code: "custom",
      message: "GTM Container ID must look like GTM-XXXXXXX",
      path: path("containerId"),
    });
  }
};

export const siteSettingsContentSchema = z
  .object({
    articleCommentsEnabled: z.boolean().default(false),
    googleAnalytics: googleAnalyticsSchema,
  })
  .superRefine((data, ctx) => {
    validateGoogleAnalytics(data.googleAnalytics, ctx, ["googleAnalytics"]);
  });

export type SiteSettingsSection =
  | "site"
  | "content"
  | "branding"
  | "routes";

export type SiteSettingsBrandingValues = z.infer<
  typeof siteSettingsBrandingSchema
>;
export type SiteSettingsRoutesValues = z.infer<typeof siteSettingsRoutesSchema>;
export type SiteSettingsSiteValues = z.infer<typeof siteSettingsSiteSchema>;
export type SiteSettingsContentValues = z.infer<
  typeof siteSettingsContentSchema
>;
export type GoogleAnalyticsFormValues = z.infer<typeof googleAnalyticsSchema>;

export const siteSettingsFormSchema = z
  .object({
    logoUrl: safeUrlSchema,
    faviconUrl: safeUrlSchema,
    ogImageUrl: safeUrlSchema,
    /** Optional CMS page rendered at `/` instead of the hardcoded home. */
    homePageId: z.string().trim().max(64).nullable().optional(),
    homeTemplateKey: z.string().trim().max(100).default("home"),
    articleTemplateKey: z.string().trim().max(100).default("article"),
    categoryTemplateKey: z.string().trim().max(100).default("category"),
    articleCommentsEnabled: z.boolean().default(false),
    googleAnalytics: googleAnalyticsSchema,
    locales: z.object({
      vi: siteLocaleSchema,
      en: siteLocaleSchema,
    }),
  })
  .superRefine(requireVietnameseSiteName)
  .superRefine((data, ctx) => {
    validateGoogleAnalytics(data.googleAnalytics, ctx, ["googleAnalytics"]);
  });

export type SiteSettingsFormValues = z.infer<typeof siteSettingsFormSchema>;
