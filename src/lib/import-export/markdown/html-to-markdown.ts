import TurndownService from "turndown";
import { isEmptyHtml } from "@/lib/html";

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (turndown) return turndown;

  turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  turndown.addRule("figureImage", {
    filter(node) {
      return (
        node.nodeName === "FIGURE" &&
        Boolean(node.querySelector?.("img"))
      );
    },
    replacement(_content, node) {
      const element = node as HTMLElement;
      const img = element.querySelector("img");
      if (!img) return "";
      const alt = img.getAttribute("alt") || "";
      const src = img.getAttribute("src") || "";
      return src ? `\n\n![${alt}](${src})\n\n` : "";
    },
  });

  return turndown;
}

export function htmlToMarkdown(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || isEmptyHtml(trimmed)) return "";
  return getTurndown().turndown(trimmed).trim();
}

export function extractImageUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const pattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match) {
    const src = match[1]?.trim();
    if (src) urls.push(src);
    match = pattern.exec(html);
  }
  return urls;
}

export function replaceImageUrlsInHtml(
  html: string,
  replace: (url: string) => string,
): string {
  return html.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (_full, prefix: string, url: string, suffix: string) =>
      `${prefix}${replace(url)}${suffix}`,
  );
}

export function replaceImageUrlsInMarkdown(
  markdown: string,
  replace: (url: string) => string,
): string {
  return markdown.replace(
    /!\[[^\]]*]\(([^)]+)\)/g,
    (full, url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return full;
      return full.replace(trimmed, replace(trimmed));
    },
  );
}
