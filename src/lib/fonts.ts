import type { CSSProperties } from "react";

export const CONTENT_FONT_PRESETS = [
  "default",
  "sans",
  "serif",
  "display",
  "mono",
  "typewriter",
  "courier",
  "courier_new",
  "xanh",
] as const;

export type ContentFontPreset = (typeof CONTENT_FONT_PRESETS)[number];

export const CONTENT_FONT_OPTIONS: Array<{
  value: ContentFontPreset;
  label: string;
}> = [
  { value: "default", label: "Default (site fonts)" },
  { value: "sans", label: "Sans (Outfit)" },
  { value: "serif", label: "Serif (Newsreader)" },
  { value: "display", label: "Display (Newsreader)" },
  { value: "mono", label: "Monospace" },
  { value: "typewriter", label: "Typewriter (Special Elite)" },
  { value: "courier", label: "Typewriter (Courier Prime)" },
  { value: "courier_new", label: "Typewriter (Courier New)" },
  { value: "xanh", label: "Typewriter (Xanh Mono · Vietnamese)" },
];

function resolveFontTokens(font: string): {
  token: string;
  stack: string;
} | null {
  const normalized = font.trim().toLowerCase();
  if (!normalized || normalized === "default") return null;
  if (normalized === "sans") {
    return {
      token: "var(--font-outfit)",
      stack: "var(--font-outfit), system-ui, sans-serif",
    };
  }
  if (normalized === "serif" || normalized === "display") {
    return {
      token: "var(--font-newsreader)",
      stack: "var(--font-newsreader), Georgia, serif",
    };
  }
  if (normalized === "mono") {
    const stack =
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    return { token: stack, stack };
  }
  if (normalized === "typewriter") {
    return {
      token: "var(--font-typewriter)",
      stack: "var(--font-typewriter), Courier New, Courier, monospace",
    };
  }
  if (normalized === "courier") {
    return {
      token: "var(--font-courier)",
      stack: "var(--font-courier), Courier New, Courier, monospace",
    };
  }
  if (normalized === "courier_new" || normalized === "courier-new") {
    return {
      token: "var(--font-courier-new)",
      stack: 'var(--font-courier-new), "Courier New", Courier, monospace',
    };
  }
  if (normalized === "xanh") {
    return {
      token: "var(--font-xanh)",
      stack: "var(--font-xanh), Courier New, Courier, monospace",
    };
  }
  const custom = font.trim();
  return { token: custom, stack: custom };
}

/** CSS font-family stack for a content font preset, or null for site default. */
export function contentFontStack(font: string): string | null {
  return resolveFontTokens(font)?.stack ?? null;
}

function normalizeFontFamilyValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map an inline font-family value back to a known content font preset. */
export function matchContentFontPreset(
  fontFamily: string | null | undefined,
): ContentFontPreset {
  const raw = (fontFamily ?? "").trim();
  if (!raw) return "default";
  const normalized = normalizeFontFamilyValue(raw);

  for (const option of CONTENT_FONT_OPTIONS) {
    if (option.value === "default") continue;
    const stack = contentFontStack(option.value);
    if (!stack) continue;
    if (normalizeFontFamilyValue(stack) === normalized) return option.value;
  }

  if (normalized.includes("--font-outfit")) return "sans";
  if (normalized.includes("--font-newsreader")) return "serif";
  if (normalized.includes("--font-typewriter")) return "typewriter";
  if (normalized.includes("--font-courier-new")) return "courier_new";
  if (normalized.includes("--font-courier")) return "courier";
  if (normalized.includes("--font-xanh")) return "xanh";
  if (normalized.includes("ui-monospace") || normalized === "monospace") {
    return "mono";
  }

  return "default";
}

/**
 * Apply a content font so the element and descendants (including
 * `font-sans` / `font-display` / prose headings / form controls) share one family.
 */
export function contentFontStyle(font: string): CSSProperties {
  const resolved = resolveFontTokens(font);
  if (!resolved) return {};
  return {
    // Primary cascade token for `.page-font-scope` CSS.
    ["--page-font" as string]: resolved.stack,
    fontFamily: resolved.stack,
    // Theme tokens + next/font vars (Tailwind may inline either into utilities).
    ["--font-sans" as string]: resolved.token,
    ["--font-display" as string]: resolved.token,
    ["--font-outfit" as string]: resolved.token,
    ["--font-newsreader" as string]: resolved.token,
  };
}
