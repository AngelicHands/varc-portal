import type { CategoryDocument } from "@/models/Category";
import { pushHeadingField } from "@/lib/import-export/markdown/section-fields";

export type SerializedCategoryMetadata = {
  key: string;
  isSystem: boolean;
  sortOrder: number;
};

export function serializeCategoryMarkdown(params: {
  locale: "vi" | "en";
  name: string;
  description: string;
  parentBase: string | null;
  parentName: string | null;
  metadata: SerializedCategoryMetadata;
}): string {
  const lines: string[] = [`# ${params.name}`, ""];

  lines.push("## Description");
  lines.push(params.description.trim() || "_No description._");
  lines.push("");

  if (params.parentBase && params.parentName) {
    lines.push(`### [${params.parentName}](${params.parentBase})`);
    lines.push("");
  }

  lines.push("## Metadata");
  lines.push("");
  pushHeadingField(lines, "key", params.metadata.key);
  pushHeadingField(
    lines,
    "isSystem",
    params.metadata.isSystem ? "true" : "false",
  );
  pushHeadingField(lines, "sortOrder", params.metadata.sortOrder);

  return `${lines.join("\n").trim()}\n`;
}

export function categoryMetadataFromDocument(
  category: CategoryDocument,
): SerializedCategoryMetadata {
  return {
    key: category.key?.trim() ?? "",
    isSystem: Boolean(category.isSystem),
    sortOrder: category.sortOrder ?? 0,
  };
}
