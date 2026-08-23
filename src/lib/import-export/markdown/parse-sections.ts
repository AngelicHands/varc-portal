const PLACEHOLDER_PATTERN = /^_(No .+|.+)_\.?$/;

export function isPlaceholderText(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

export function normalizeImportedText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || isPlaceholderText(trimmed)) return "";
  return trimmed;
}

export type ParsedMarkdownDocument = {
  title: string;
  sections: Record<string, string>;
  contentBody: string;
};

export function parseMarkdownDocument(markdown: string): ParsedMarkdownDocument {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  let currentSection: string | null = null;
  const sections: Record<string, string> = {};
  const buffers: string[] = [];
  let contentStartIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!title && line.startsWith("# ")) {
      title = line.slice(2).trim();
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)\s*$/);
    if (h2Match) {
      if (currentSection && currentSection !== "Content") {
        sections[currentSection] = buffers.join("\n").trim();
      }
      currentSection = h2Match[1]?.trim() ?? "";
      buffers.length = 0;
      if (currentSection === "Content") {
        contentStartIndex = i + 1;
        break;
      }
      continue;
    }

    if (currentSection) {
      buffers.push(line);
    }
  }

  if (currentSection && currentSection !== "Content") {
    sections[currentSection] = buffers.join("\n").trim();
  }

  const contentBody =
    contentStartIndex >= 0 ? lines.slice(contentStartIndex).join("\n").trim() : "";

  return {
    title,
    sections,
    contentBody,
  };
}

export function parseHeadingFields(content: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const trimmed = content.trim();
  if (!trimmed) return fields;

  if (trimmed.includes("###")) {
    const blocks = trimmed.split(/^###\s+/m).filter(Boolean);
    for (const block of blocks) {
      const newlineIndex = block.indexOf("\n");
      const label =
        newlineIndex === -1 ? block.trim() : block.slice(0, newlineIndex).trim();
      const value =
        newlineIndex === -1
          ? ""
          : block.slice(newlineIndex + 1).trim();
      if (label) {
        fields[label] = normalizeImportedText(value);
      }
    }
    return fields;
  }

  for (const line of trimmed.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match?.[1]) {
      fields[match[1]] = normalizeImportedText(match[2] ?? "");
    }
  }

  return fields;
}

export function parseParentLink(content: string): {
  parentName: string | null;
  parentBase: string | null;
  description: string;
} {
  const trimmed = content.trim();
  const match = trimmed.match(/^###\s+\[([^\]]+)]\(([^)]+)\)\s*$/m);
  if (!match) {
    return {
      parentName: null,
      parentBase: null,
      description: normalizeImportedText(trimmed),
    };
  }

  const description = normalizeImportedText(
    trimmed.replace(match[0], "").trim(),
  );

  return {
    parentName: match[1]?.trim() || null,
    parentBase: match[2]?.trim() || null,
    description,
  };
}
