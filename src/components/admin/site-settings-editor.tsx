"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageSourceField } from "@/components/admin/image-source-field";
import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { saveSiteSettingsAction } from "@/lib/actions";
import type {
  SiteSettingsFormValues,
  SiteSettingsSection,
} from "@/lib/validations/article";
import { normalizeSiteSettingsForm } from "@/lib/site-settings-form";
import { notifyAction } from "@/components/admin/admin-toast";

type Props = {
  activeSection: SiteSettingsSection;
  initial: SiteSettingsFormValues;
  pageOptions: Array<{ id: string; title: string }>;
  templateOptions: Array<{ key: string; name: string }>;
};

type SiteLocaleFields = SiteSettingsFormValues["locales"]["vi"];

type SectionFeedback = {
  error: string | null;
  saved: boolean;
};

const EMPTY_FEEDBACK: SectionFeedback = { error: null, saved: false };

function getSectionPayload(
  section: SiteSettingsSection,
  form: SiteSettingsFormValues,
) {
  switch (section) {
    case "branding":
      return {
        logoUrl: form.logoUrl,
        faviconUrl: form.faviconUrl,
        ogImageUrl: form.ogImageUrl,
      };
    case "routes":
      return {
        homePageId: form.homePageId,
        homeTemplateKey: form.homeTemplateKey,
        articleTemplateKey: form.articleTemplateKey,
        categoryTemplateKey: form.categoryTemplateKey,
      };
    case "content":
      return {
        articleCommentsEnabled: form.articleCommentsEnabled,
        googleAnalytics: form.googleAnalytics,
      };
    case "site":
      return {
        locales: form.locales,
      };
  }
}

function SectionSaveControls({
  section,
  label,
  savingSection,
  feedback,
  onSave,
}: {
  section: SiteSettingsSection;
  label: string;
  savingSection: SiteSettingsSection | null;
  feedback: SectionFeedback;
  onSave: (section: SiteSettingsSection) => void;
}) {
  const isSaving = savingSection === section;

  return (
    <div className="space-y-3">
      {feedback.error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {feedback.error}
        </p>
      ) : null}
      {feedback.saved ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {label} saved.
        </p>
      ) : null}
      <button
        type="button"
        disabled={isSaving || savingSection !== null}
        onClick={() => onSave(section)}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
      >
        {isSaving ? "Saving…" : `Save ${label.toLowerCase()}`}
      </button>
    </div>
  );
}

export function SiteSettingsEditor({
  activeSection,
  initial,
  pageOptions,
  templateOptions,
}: Props) {
  const router = useRouter();
  const [savingSection, setSavingSection] = useState<SiteSettingsSection | null>(
    null,
  );
  const [feedback, setFeedback] = useState<
    Record<SiteSettingsSection, SectionFeedback>
  >({
    site: { ...EMPTY_FEEDBACK },
    content: { ...EMPTY_FEEDBACK },
    branding: { ...EMPTY_FEEDBACK },
    routes: { ...EMPTY_FEEDBACK },
  });
  const [form, setForm] = useState(() => normalizeSiteSettingsForm(initial));
  const [localeTab, setLocaleTab] = useState<"vi" | "en">("vi");

  const analyticsEnabled = Boolean(form.googleAnalytics.enabled);

  function clearSectionFeedback(section: SiteSettingsSection) {
    setFeedback((prev) => ({
      ...prev,
      [section]: { ...EMPTY_FEEDBACK },
    }));
  }

  function updateLocale(
    locale: "vi" | "en",
    field: keyof SiteLocaleFields,
    value: string,
  ) {
    setForm((prev) => ({
      ...prev,
      locales: {
        ...prev.locales,
        [locale]: { ...prev.locales[locale], [field]: value },
      },
    }));
    clearSectionFeedback("site");
  }

  async function onSave(section: SiteSettingsSection) {
    setFeedback((prev) => ({
      ...prev,
      [section]: { error: null, saved: false },
    }));
    setSavingSection(section);

    const result = await saveSiteSettingsAction(
      section,
      getSectionPayload(section, form),
    );

    setSavingSection(null);

    if (!notifyAction(result, `${sectionLabel(section)} saved`)) {
      setFeedback((prev) => ({
        ...prev,
        [section]: { error: result.error, saved: false },
      }));
      return;
    }

    setFeedback((prev) => ({
      ...prev,
      [section]: { error: null, saved: true },
    }));
    router.refresh();
  }

  const locale = form.locales[localeTab];

  return (
    <div className="space-y-6">
      {activeSection === "branding" ? (
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-base font-semibold">Brand assets</h2>
          <p className="text-sm text-gray-600">
            Shared across languages. Prefer a public URL for logos used in the
            header.
          </p>
          <ImageSourceField
            label="Logo"
            description="Shown in the site header next to or instead of the site name."
            value={form.logoUrl}
            onChange={(logoUrl) => {
              setForm((prev) => ({ ...prev, logoUrl }));
              clearSectionFeedback("branding");
            }}
          />
          <ImageSourceField
            label="Favicon"
            description="Browser tab icon. Prefer a small PNG/ICO URL."
            value={form.faviconUrl}
            onChange={(faviconUrl) => {
              setForm((prev) => ({ ...prev, faviconUrl }));
              clearSectionFeedback("branding");
            }}
          />
          <ImageSourceField
            label="Default Open Graph image"
            description="Fallback social share image when a page has no OG image."
            value={form.ogImageUrl}
            onChange={(ogImageUrl) => {
              setForm((prev) => ({ ...prev, ogImageUrl }));
              clearSectionFeedback("branding");
            }}
          />
          <SectionSaveControls
            section="branding"
            label="Branding"
            savingSection={savingSection}
            feedback={feedback.branding}
            onSave={onSave}
          />
        </section>
      ) : null}

      {activeSection === "routes" ? (
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-base font-semibold">Route templates</h2>
          <p className="text-sm text-gray-600">
            Optionally wire Home, Article, and Category routes to page templates.
            Leave Home template as &quot;home&quot; and Home page empty to keep
            the built-in React home.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Home CMS page</span>
            <select
              value={form.homePageId ?? ""}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  homePageId: e.target.value || null,
                }));
                clearSectionFeedback("routes");
              }}
              className="w-full rounded border border-gray-300 px-3 py-2 md:max-w-md"
            >
              <option value="">None (use hardcoded / template key)</option>
              {pageOptions.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ["homeTemplateKey", "Home template"],
                ["articleTemplateKey", "Article template"],
                ["categoryTemplateKey", "Category template"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="block text-sm">
                <span className="mb-1 block font-medium">{label}</span>
                <select
                  value={form[field]}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, [field]: e.target.value }));
                    clearSectionFeedback("routes");
                  }}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                >
                  {templateOptions.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Article/Category: keep the default key for the classic layout; pick
            another template to render those routes with the block builder.
            Category archives live at /categories/[slug].
          </p>
          <SectionSaveControls
            section="routes"
            label="Routes configuration"
            savingSection={savingSection}
            feedback={feedback.routes}
            onSave={onSave}
          />
        </section>
      ) : null}

      {activeSection === "content" ? (
        <>
          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold">Article comments</h2>
            <p className="text-sm text-gray-600">
              Master switch for comments on published articles. Each article
              still needs Comments set to Open or Moderated under Access.
            </p>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
              <AdminCheckbox
                className="mt-0.5"
                checked={Boolean(form.articleCommentsEnabled)}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    articleCommentsEnabled: e.target.checked,
                  }));
                  clearSectionFeedback("content");
                }}
              />
              <span className="min-w-0">
                <span className="block font-medium text-gray-900">
                  Enable article comments
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  Signed-in members who can view an article may post when that
                  article allows comments.
                </span>
              </span>
            </label>
          </section>

          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold">Google Analytics</h2>
            <p className="text-sm text-gray-600">
              Load analytics on public portal pages only. Admin pages are never
              tracked.
            </p>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
              <AdminCheckbox
                className="mt-0.5"
                checked={analyticsEnabled}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    googleAnalytics: {
                      ...prev.googleAnalytics,
                      enabled: e.target.checked,
                    },
                  }));
                  clearSectionFeedback("content");
                }}
              />
              <span className="min-w-0">
                <span className="block font-medium text-gray-900">
                  Enable Google Analytics
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  Injects GA4 or Google Tag Manager on the public site when
                  configured below.
                </span>
              </span>
            </label>

            {analyticsEnabled ? (
              <>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-gray-900">
                    Provider
                  </legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {(
                      [
                        ["ga4", "GA4 (Measurement ID)"],
                        ["gtm", "Google Tag Manager"],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <input
                          type="radio"
                          name="google-analytics-provider"
                          value={value}
                          checked={form.googleAnalytics.provider === value}
                          onChange={() => {
                            setForm((prev) => ({
                              ...prev,
                              googleAnalytics: {
                                ...prev.googleAnalytics,
                                provider: value,
                              },
                            }));
                            clearSectionFeedback("content");
                          }}
                          className="h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {form.googleAnalytics.provider === "ga4" ? (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">
                      GA4 Measurement ID
                    </span>
                    <input
                      value={form.googleAnalytics.measurementId}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          googleAnalytics: {
                            ...prev.googleAnalytics,
                            measurementId: e.target.value,
                          },
                        }));
                        clearSectionFeedback("content");
                      }}
                      placeholder="G-XXXXXXXXXX"
                      className="w-full rounded border border-gray-300 px-3 py-2 md:max-w-md"
                    />
                    <span className="mt-1 block text-xs text-gray-500">
                      From Google Analytics → Admin → Data streams → your web
                      stream.
                    </span>
                  </label>
                ) : (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">
                      GTM Container ID
                    </span>
                    <input
                      value={form.googleAnalytics.containerId}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          googleAnalytics: {
                            ...prev.googleAnalytics,
                            containerId: e.target.value,
                          },
                        }));
                        clearSectionFeedback("content");
                      }}
                      placeholder="GTM-XXXXXXX"
                      className="w-full rounded border border-gray-300 px-3 py-2 md:max-w-md"
                    />
                    <span className="mt-1 block text-xs text-gray-500">
                      From Google Tag Manager → Admin → Container Settings.
                    </span>
                  </label>
                )}

                {form.googleAnalytics.provider === "ga4" ? (
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
                    <AdminCheckbox
                      className="mt-0.5"
                      checked={Boolean(form.googleAnalytics.debugMode)}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          googleAnalytics: {
                            ...prev.googleAnalytics,
                            debugMode: e.target.checked,
                          },
                        }));
                        clearSectionFeedback("content");
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900">
                        Debug mode
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        Sends events to GA4 DebugView. Turn off after verifying
                        hits.
                      </span>
                    </span>
                  </label>
                ) : null}
              </>
            ) : null}
          </section>

          <SectionSaveControls
            section="content"
            label="Content settings"
            savingSection={savingSection}
            feedback={feedback.content}
            onSave={onSave}
          />
        </>
      ) : null}

      {activeSection === "site" ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLocaleTab("vi")}
              className={`rounded px-3 py-1.5 text-sm ${
                localeTab === "vi"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300"
              }`}
            >
              Vietnamese
            </button>
            <button
              type="button"
              onClick={() => setLocaleTab("en")}
              className={`rounded px-3 py-1.5 text-sm ${
                localeTab === "en"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300"
              }`}
            >
              English
            </button>
          </div>

          <section className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-2">
            <h2 className="text-base font-semibold md:col-span-2">
              {localeTab === "vi" ? "Vietnamese content" : "English content"}
            </h2>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Site name</span>
              <input
                value={locale.siteName}
                onChange={(e) =>
                  updateLocale(localeTab, "siteName", e.target.value)
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
                placeholder="VARC"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Site title</span>
              <input
                value={locale.siteTitle}
                onChange={(e) =>
                  updateLocale(localeTab, "siteTitle", e.target.value)
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
                placeholder="Full organization name"
              />
            </label>

            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-medium">Tagline</span>
              <textarea
                value={locale.tagline}
                onChange={(e) =>
                  updateLocale(localeTab, "tagline", e.target.value)
                }
                rows={2}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-medium">
                Copyright / footer text
              </span>
              <input
                value={locale.copyright}
                onChange={(e) =>
                  updateLocale(localeTab, "copyright", e.target.value)
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">SEO meta title</span>
              <input
                value={locale.metaTitle}
                onChange={(e) =>
                  updateLocale(localeTab, "metaTitle", e.target.value)
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
                placeholder="Defaults to site name if empty"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">SEO meta description</span>
              <textarea
                value={locale.metaDescription}
                onChange={(e) =>
                  updateLocale(localeTab, "metaDescription", e.target.value)
                }
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
          </section>

          <SectionSaveControls
            section="site"
            label="Site settings"
            savingSection={savingSection}
            feedback={feedback.site}
            onSave={onSave}
          />
        </>
      ) : null}
    </div>
  );
}

function sectionLabel(section: SiteSettingsSection): string {
  switch (section) {
    case "branding":
      return "Branding";
    case "content":
      return "Content settings";
    case "routes":
      return "Routes configuration";
    case "site":
      return "Site settings";
  }
}
