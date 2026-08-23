import {
  normalizeImportedText,
  parseHeadingFields,
  parseMarkdownDocument,
  parseParentLink,
} from "@/lib/import-export/markdown/parse-sections";

export type ParsedCategoryMarkdown = {
  base: string;
  locale: "vi" | "en";
  name: string;
  description: string;
  parentBase: string | null;
  key: string;
  isSystem: boolean;
  sortOrder: number;
};

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === "true";
}

function parseSortOrder(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseCategoryMarkdown(params: {
  base: string;
  locale: "vi" | "en";
  markdown: string;
}): ParsedCategoryMarkdown {
  const doc = parseMarkdownDocument(params.markdown);
  const descriptionSection = doc.sections.Description ?? "";
  const parent = parseParentLink(descriptionSection);
  const metadata = parseHeadingFields(doc.sections.Metadata ?? "");

  return {
    base: params.base,
    locale: params.locale,
    name: normalizeImportedText(doc.title),
    description: parent.description,
    parentBase: parent.parentBase,
    key: metadata.key ?? params.base,
    isSystem: parseBoolean(metadata.isSystem),
    sortOrder: parseSortOrder(metadata.sortOrder),
  };
}

export type ParsedCategoryPair = {
  base: string;
  vi: ParsedCategoryMarkdown;
  en: ParsedCategoryMarkdown;
};

export function mergeCategoryPair(
  vi: ParsedCategoryMarkdown,
  en: ParsedCategoryMarkdown,
): {
  base: string;
  key: string;
  isSystem: boolean;
  sortOrder: number;
  parentBase: string | null;
  locales: {
    vi: { name: string; description: string };
    en: { name: string; description: string };
  };
} {
  return {
    base: vi.base,
    key: vi.key || en.key || vi.base,
    isSystem: vi.isSystem || en.isSystem,
    sortOrder: vi.sortOrder || en.sortOrder,
    parentBase: vi.parentBase || en.parentBase,
    locales: {
      vi: { name: vi.name, description: vi.description },
      en: { name: en.name, description: en.description },
    },
  };
}

export function sortCategoriesByParent<
  T extends { base: string; parentBase: string | null },
>(categories: T[]): T[] {
  const byBase = new Map(categories.map((item) => [item.base, item]));
  const sorted: T[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(base: string) {
    if (visited.has(base)) return;
    if (visiting.has(base)) {
      throw new Error(`Circular category hierarchy detected at "${base}"`);
    }
    visiting.add(base);
    const item = byBase.get(base);
    if (item?.parentBase && byBase.has(item.parentBase)) {
      visit(item.parentBase);
    }
    visiting.delete(base);
    visited.add(base);
    if (item) sorted.push(item);
  }

  for (const item of categories) {
    visit(item.base);
  }

  return sorted;
}
