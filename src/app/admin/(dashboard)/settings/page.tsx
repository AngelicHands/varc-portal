import {
  getPageLocale,
  getSiteSettingsFormValues,
  listPages,
} from "@/lib/cms";
import { listPageTemplateOptions } from "@/lib/blocks/templates";
import { AdminRouteTabs } from "@/components/admin/admin-route-tabs";
import { siteSettingsEditorKey } from "@/lib/site-settings-form";
import { SiteSettingsEditor } from "@/components/admin/site-settings-editor";
import { requireSitePage } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "site", label: "Site Settings", href: "/admin/settings" },
  {
    id: "content",
    label: "Content Settings",
    href: "/admin/settings?tab=content",
  },
  { id: "branding", label: "Branding", href: "/admin/settings?tab=branding" },
  {
    id: "routes",
    label: "Routes Configuration",
    href: "/admin/settings?tab=routes",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

function resolveTab(tab: string | undefined): TabId {
  if (tab === "content" || tab === "branding" || tab === "routes") return tab;
  return "site";
}

const TAB_DESCRIPTIONS: Record<TabId, string> = {
  site: "Site name, title, tagline, SEO metadata, and copyright.",
  content: "Site-wide content features such as article comments and analytics.",
  branding: "Logo, favicon, and default social share image used across the site.",
  routes:
    "Wire Home, Article, and Category routes to CMS pages and block templates.",
};

export default async function AdminSiteSettingsPage({ searchParams }: Props) {
  await requireSitePage();

  const { tab } = await searchParams;
  const activeTab = resolveTab(tab);

  const [initial, pages, templates] = await Promise.all([
    getSiteSettingsFormValues(),
    listPages(),
    listPageTemplateOptions(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-gray-600">
        {TAB_DESCRIPTIONS[activeTab]}
      </p>

      <AdminRouteTabs tabs={[...TABS]} active={activeTab} />

      <div className="mt-8">
        <SiteSettingsEditor
          key={siteSettingsEditorKey(initial)}
          activeSection={activeTab}
          initial={initial}
          pageOptions={pages
            .filter((page) => page.status === "published")
            .map((page) => ({
              id: String(page._id),
              title:
                getPageLocale(page, "vi").title ||
                getPageLocale(page, "en").title ||
                String(page._id),
            }))}
          templateOptions={templates.map((template) => ({
            key: template.key,
            name: template.name,
          }))}
        />
      </div>
    </div>
  );
}
