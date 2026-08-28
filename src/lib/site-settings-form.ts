import type {
  GoogleAnalyticsFormValues,
  SiteSettingsFormValues,
} from "@/lib/validations/article";

const DEFAULT_GOOGLE_ANALYTICS: GoogleAnalyticsFormValues = {
  enabled: false,
  provider: "ga4",
  measurementId: "",
  containerId: "",
  debugMode: false,
};

export function siteSettingsEditorKey(initial: SiteSettingsFormValues): string {
  return JSON.stringify({
    articleCommentsEnabled: initial.articleCommentsEnabled,
    googleAnalytics: initial.googleAnalytics,
  });
}

export function normalizeSiteSettingsForm(
  initial: SiteSettingsFormValues,
): SiteSettingsFormValues {
  return {
    ...initial,
    googleAnalytics: {
      ...DEFAULT_GOOGLE_ANALYTICS,
      ...initial.googleAnalytics,
      enabled: Boolean(initial.googleAnalytics?.enabled),
      debugMode: Boolean(initial.googleAnalytics?.debugMode),
      provider:
        initial.googleAnalytics?.provider === "gtm" ? "gtm" : "ga4",
    },
  };
}
