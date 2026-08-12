import {
  CONTENT_FONT_PRESETS,
  contentFontStyle,
  type ContentFontPreset,
} from "@/lib/fonts";
import {
  parseAttrBlock,
  parseMarkdownFieldToken,
  replaceMarkdownFieldTokens,
  scanMarkdownFieldTokens,
  type ParsedMarkdownFieldToken,
} from "@/lib/validations/forms";

export const FORM_FIELD_LINK_PREFIX = "form-field:";

export const FORM_STEP_TOKEN_RE =
  /!#!\[step:"((?:\\.|[^"\\])*)"(?::\{([^}]*)\})?\]/gi;

export const FORM_STEP_FONT_PRESETS = CONTENT_FONT_PRESETS;
export type FormStepFontPreset = ContentFontPreset;

export { contentFontStyle as formStepFontStyle };
export type FormMarkdownToken = ParsedMarkdownFieldToken & {
  tokenIndex: number;
  raw: string;
};

export type FormMarkdownStep = {
  title: string;
  font: string;
  markdown: string;
  fieldNames: string[];
};

export type FormMarkdownLayout = {
  /** Markdown shown above every tab (content before the first step marker). */
  sharedMarkdown: string;
  sharedFieldNames: string[];
  steps: FormMarkdownStep[];
};

export function extractFormMarkdownTokens(markdown: string): FormMarkdownToken[] {
  const tokens: FormMarkdownToken[] = [];
  let tokenIndex = 0;

  for (const match of scanMarkdownFieldTokens(markdown)) {
    const parsed = parseMarkdownFieldToken(match.raw);
    if (!parsed) continue;
    tokens.push({
      ...parsed,
      tokenIndex,
      raw: match.raw,
    });
    tokenIndex += 1;
  }

  return tokens;
}

export function parseFormStepToken(token: string): {
  title: string;
  font: string;
} | null {
  const match = token.match(
    /^!#!\[step:"((?:\\.|[^"\\])*)"(?::\{([^}]*)\})?\]$/i,
  );
  if (!match) return null;
  const title = (match[1] ?? "")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
  const attrs = parseAttrBlock(match[2] ?? "");
  const font = (attrs.font ?? attrs.fontFamily ?? "default").trim() || "default";
  return { title, font };
}

function fieldNamesInMarkdown(markdown: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of scanMarkdownFieldTokens(markdown)) {
    const parsed = parseMarkdownFieldToken(match.raw);
    if (!parsed || seen.has(parsed.name)) continue;
    seen.add(parsed.name);
    names.push(parsed.name);
  }
  return names;
}

export function splitFormMarkdownSteps(markdown: string): FormMarkdownLayout {
  const source = markdown.replace(/\r\n/g, "\n");
  const re = new RegExp(FORM_STEP_TOKEN_RE.source, "gi");
  const markers: Array<{
    index: number;
    length: number;
    title: string;
    font: string;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const parsed = parseFormStepToken(match[0] ?? "");
    if (!parsed) continue;
    markers.push({
      index: match.index,
      length: match[0].length,
      title: parsed.title,
      font: parsed.font,
    });
  }

  if (markers.length === 0) {
    const content = source.trim();
    return {
      sharedMarkdown: "",
      sharedFieldNames: [],
      steps: [
        {
          title: "",
          font: "default",
          markdown: content,
          fieldNames: fieldNamesInMarkdown(content),
        },
      ],
    };
  }

  const sharedMarkdown = source.slice(0, markers[0]!.index).trim();
  const steps: FormMarkdownStep[] = [];

  for (const [i, marker] of markers.entries()) {
    const start = marker.index + marker.length;
    const end = markers[i + 1]?.index ?? source.length;
    const content = source.slice(start, end).trim();
    steps.push({
      title: marker.title,
      font: marker.font,
      markdown: content,
      fieldNames: fieldNamesInMarkdown(content),
    });
  }

  return {
    sharedMarkdown,
    sharedFieldNames: fieldNamesInMarkdown(sharedMarkdown),
    steps: steps.filter((step) => step.markdown.length > 0 || step.title.length > 0),
  };
}

export function preprocessFormSchemaMarkdown(markdown: string): {
  markdown: string;
  tokens: FormMarkdownToken[];
} {
  const tokens: FormMarkdownToken[] = [];

  const processed = replaceMarkdownFieldTokens(markdown, (raw, tokenIndex) => {
    const parsed = parseMarkdownFieldToken(raw);
    if (!parsed) return raw;
    tokens.push({
      ...parsed,
      tokenIndex,
      raw,
    });
    return `![](${FORM_FIELD_LINK_PREFIX}${tokenIndex})`;
  });

  return { markdown: processed, tokens };
}
