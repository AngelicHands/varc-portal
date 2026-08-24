export type AdminNavFlag =
  | "always"
  | "editorial"
  | "importExport"
  | "pages"
  | "site"
  | "users"
  | "roles";

export type AdminNavVisibility = {
  showEditorial: boolean;
  showImportExport: boolean;
  showPages: boolean;
  showSite: boolean;
  showUsers: boolean;
  showRoles: boolean;
};

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  flag: AdminNavFlag;
  external?: boolean;
  keywords?: string[];
};

export type AdminNavGroup = {
  id: string;
  label: string | null;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    id: "overview",
    label: null,
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        description: "Overview of recent activity and admin shortcuts.",
        flag: "always",
        keywords: ["home", "overview"],
      },
      {
        href: "/",
        label: "View site",
        description: "Open the public portal in a new tab.",
        flag: "always",
        external: true,
        keywords: ["portal", "public", "frontend"],
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      {
        href: "/admin/settings",
        label: "Site Settings",
        description: "Configure site name, branding, and global options.",
        flag: "site",
        keywords: ["configuration", "config", "general"],
      },
      {
        href: "/admin/backup",
        label: "Backup/Restore",
        description: "Export, import, and restore site data and content.",
        flag: "site",
        keywords: ["export", "import", "restore", "database"],
      },
      {
        href: "/admin/users",
        label: "Users",
        description: "Manage member accounts, profiles, and access.",
        flag: "users",
        keywords: ["accounts", "members"],
      },
      {
        href: "/admin/roles",
        label: "Roles",
        description: "Define roles and what each role is allowed to do.",
        flag: "roles",
        keywords: ["permissions", "capabilities"],
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      {
        href: "/admin/articles",
        label: "Articles",
        description: "Create, edit, and publish news and blog posts.",
        flag: "editorial",
        keywords: ["posts", "news", "blog"],
      },
      {
        href: "/admin/categories",
        label: "Categories",
        description: "Organize articles and content into categories.",
        flag: "editorial",
        keywords: ["taxonomy", "tags"],
      },
      {
        href: "/admin/import-export",
        label: "Import/Export",
        description: "Bulk move content in or out of the CMS.",
        flag: "importExport",
        keywords: ["migrate", "transfer"],
      },
      {
        href: "/admin/media",
        label: "Media",
        description: "Upload and manage images and other media files.",
        flag: "editorial",
        keywords: ["images", "files", "gallery", "uploads"],
      },
      {
        href: "/admin/pages",
        label: "Pages",
        description: "Build and edit static pages for the public site.",
        flag: "pages",
        keywords: ["static", "landing"],
      },
      {
        href: "/admin/callsigns",
        label: "Callsigns",
        description: "Manage ham radio operator callsign records.",
        flag: "site",
        keywords: ["ham", "radio", "operators"],
      },
      {
        href: "/admin/forms",
        label: "Forms",
        description: "Create forms and review submitted responses.",
        flag: "site",
        keywords: ["submissions", "surveys"],
      },
      {
        href: "/admin/mailbox",
        label: "Mailbox",
        description: "View inbound email and outgoing message jobs.",
        flag: "site",
        keywords: ["email", "messages", "inbox"],
      },
      {
        href: "/admin/templates",
        label: "Templates",
        description: "Design reusable page and email layout templates.",
        flag: "site",
        keywords: ["layouts", "design"],
      },
      {
        href: "/admin/menu",
        label: "Menus",
        description: "Edit header, footer, and navigation menu links.",
        flag: "site",
        keywords: ["navigation", "header", "footer"],
      },
    ],
  },
];

const adminQuickActions: AdminNavItem[] = [
  {
    href: "/admin/articles/new",
    label: "New article",
    description: "Start writing a new article or news post.",
    flag: "editorial",
    keywords: ["create", "write", "post"],
  },
  {
    href: "/admin/pages/new",
    label: "New page",
    description: "Create a new static page for the public site.",
    flag: "pages",
    keywords: ["create"],
  },
  {
    href: "/admin/categories/new",
    label: "New category",
    description: "Add a category to group related content.",
    flag: "editorial",
    keywords: ["create"],
  },
  {
    href: "/admin/forms/new",
    label: "New form",
    description: "Set up a new form to collect submissions.",
    flag: "site",
    keywords: ["create"],
  },
  {
    href: "/admin/templates/new",
    label: "New template",
    description: "Create a reusable layout or email template.",
    flag: "site",
    keywords: ["create"],
  },
];

export type AdminFunction = AdminNavItem & {
  id: string;
  group: string;
};

function navItemId(href: string, label: string) {
  return `${href}::${label}`;
}

export function isAdminNavItemVisible(
  item: AdminNavItem,
  flags: AdminNavVisibility,
): boolean {
  if (item.flag === "editorial") return flags.showEditorial;
  if (item.flag === "importExport") return flags.showImportExport;
  if (item.flag === "pages") return flags.showPages;
  if (item.flag === "site") return flags.showSite;
  if (item.flag === "users") return flags.showUsers;
  if (item.flag === "roles") return flags.showRoles;
  return true;
}

export function getVisibleAdminFunctions(
  flags: AdminNavVisibility,
): AdminFunction[] {
  const fromNav = adminNavGroups.flatMap((group) =>
    group.items
      .filter((item) => isAdminNavItemVisible(item, flags))
      .map((item) => ({
        ...item,
        id: navItemId(item.href, item.label),
        group: group.label ?? "Overview",
      })),
  );

  const quickActions = adminQuickActions
    .filter((item) => isAdminNavItemVisible(item, flags))
    .map((item) => ({
      ...item,
      id: navItemId(item.href, item.label),
      group: "Quick actions",
    }));

  return [...fromNav, ...quickActions];
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

export function searchAdminFunctions(
  functions: AdminFunction[],
  query: string,
): AdminFunction[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return functions;

  return functions.filter((item) => {
    const haystack = [
      item.label,
      item.description,
      item.group,
      ...(item.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}
