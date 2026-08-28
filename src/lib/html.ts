import DOMPurify from "isomorphic-dompurify";

export function isEmptyHtml(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0;
}

/** Plain text from HTML, suitable for card excerpts. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate plain text for card previews. */
export function excerptFromHtml(html: string, maxLength = 160): string {
  const text = htmlToPlainText(html);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const trimmed =
    lastSpace > Math.floor(maxLength * 0.6)
      ? sliced.slice(0, lastSpace)
      : sliced;
  return `${trimmed.trimEnd()}…`;
}

/** Convert legacy Markdown-ish plain text to a simple HTML paragraph if needed. */
export function normalizeEditorHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["figure", "figcaption", "colgroup", "col", "video"],
    ADD_ATTR: [
      "target",
      "rel",
      "class",
      "data-size",
      "data-text-align",
      "data-type",
      "data-hls-src",
      "data-theme",
      "data-language",
      "data-language-label",
      "data-show-language-label",
      "data-show-line-numbers",
      "controls",
      "playsinline",
      "preload",
      "poster",
      "width",
      "height",
      "style",
      "colwidth",
      "colspan",
      "rowspan",
      "align",
      "valign",
    ],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
  return withImageFigures(withTableWrappers(clean));
}

/** Ensure tables can scroll on small screens without breaking column layout. */
export function withTableWrappers(html: string): string {
  if (!html?.trim()) return html;

  const parts = html.split(/(<div\b[^>]*\btableWrapper\b[^>]*>[\s\S]*?<\/div>)/gi);
  return parts
    .map((part) => {
      if (/tableWrapper/i.test(part) && /^<div\b/i.test(part)) {
        return part;
      }
      return part.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
        return `<div class="tableWrapper">${table}</div>`;
      });
    })
    .join("");
}

/**
 * Ensure images that have alt text also show a visible figcaption.
 * Skips images already inside a <figure> that already has a caption.
 */
export function withImageFigures(html: string): string {
  if (!html?.trim()) return html;

  // Process segments outside existing <figure>...</figure> blocks.
  const parts = html.split(/(<figure\b[^>]*>[\s\S]*?<\/figure>)/gi);
  return parts
    .map((part) => {
      if (/^<figure\b/i.test(part)) {
        return enhanceExistingFigure(part);
      }

      return part.replace(/<img\b[^>]*>/gi, (imgTag) => {
        const alt = readAttr(imgTag, "alt");
        const size = readAttr(imgTag, "data-size");
        const align =
          readAttr(imgTag, "data-text-align") ||
          readTextAlignFromStyle(imgTag) ||
          "left";
        const sizeAttr = size ? ` data-size="${escapeAttr(size)}"` : "";
        const alignAttr = ` data-text-align="${escapeAttr(align)}"`;
        const alignClass = ` content-figure--align-${escapeAttr(align)}`;
        const style = alignStyleFor(align);
        const caption = alt
          ? `<figcaption class="content-figcaption">${escapeHtml(alt)}</figcaption>`
          : "";
        return `<figure class="content-figure${alignClass}"${sizeAttr}${alignAttr} style="${style}">${imgTag}${caption}</figure>`;
      });
    })
    .join("");
}

function enhanceExistingFigure(figureHtml: string): string {
  const imgMatch = figureHtml.match(/<img\b[^>]*>/i);
  if (!imgMatch) return figureHtml;
  const imgTag = imgMatch[0];

  const captionMatch = figureHtml.match(
    /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i,
  );
  const captionText = (captionMatch?.[1] ?? "").replace(/<[^>]*>/g, "").trim();
  const altText = readAttr(imgTag, "alt");
  const text = captionText || altText;

  let next = figureHtml;
  if (text) {
    const nextImg = setAttr(imgTag, "alt", text);
    next = next.replace(imgTag, nextImg);

    if (captionMatch) {
      next = next.replace(
        /<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/i,
        `<figcaption class="content-figcaption">${escapeHtml(text)}</figcaption>`,
      );
    } else {
      next = next.replace(
        /<\/figure>/i,
        `<figcaption class="content-figcaption">${escapeHtml(text)}</figcaption></figure>`,
      );
    }
  }

  if (!/\bclass\s*=/i.test(next)) {
    next = next.replace(/<figure\b/i, `<figure class="content-figure"`);
  } else if (!/content-figure/i.test(next)) {
    next = next.replace(
      /<figure\b([^>]*?)\bclass\s*=\s*(["'])([^"']*)\2/i,
      `<figure$1class=$2$3 content-figure$2`,
    );
  }

  // Preserve / normalize alignment for published CSS.
  const open = next.match(/^<figure\b[^>]*>/i)?.[0];
  if (open) {
    const align =
      readAttr(open, "data-text-align") ||
      readTextAlignFromStyle(open) ||
      readAttr(imgTag, "data-text-align") ||
      readTextAlignFromStyle(imgTag) ||
      "left";

    let attrs = open.replace(/^<figure\b/i, "").replace(/>$/i, "");
    // class
    if (/\bclass\s*=/i.test(attrs)) {
      if (!/content-figure/i.test(attrs)) {
        attrs = attrs.replace(
          /\bclass\s*=\s*(["'])([^"']*)\1/i,
          (_, q: string, cls: string) => ` class=${q}${cls} content-figure${q}`,
        );
      }
      if (!new RegExp(`content-figure--align-${align}`).test(attrs)) {
        attrs = attrs.replace(
          /\bclass\s*=\s*(["'])([^"']*)\1/i,
          (_, q: string, cls: string) =>
            ` class=${q}${cls.replace(/\s*content-figure--align-\w+/g, "")} content-figure--align-${align}${q}`,
        );
      }
    } else {
      attrs += ` class="content-figure content-figure--align-${align}"`;
    }
    // data-text-align
    if (/\bdata-text-align\s*=/i.test(attrs)) {
      attrs = attrs.replace(
        /\bdata-text-align\s*=\s*(["'])[^"']*\1/i,
        `data-text-align="${escapeAttr(align)}"`,
      );
    } else {
      attrs += ` data-text-align="${escapeAttr(align)}"`;
    }
    // inline style fallback (also helps if CSS misses)
    if (/\bstyle\s*=/i.test(attrs)) {
      attrs = attrs.replace(
        /\bstyle\s*=\s*(["'])[\s\S]*?\1/i,
        `style="${alignStyleFor(align)}"`,
      );
    } else {
      attrs += ` style="${alignStyleFor(align)}"`;
    }

    next = next.replace(open, `<figure${attrs}>`);
  }

  return next;
}

function readTextAlignFromStyle(tag: string): string {
  const match = tag.match(/text-align\s*:\s*(left|center|right|justify)/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function alignStyleFor(align: string): string {
  if (align === "center" || align === "justify") {
    return "margin-left: auto; margin-right: auto; text-align: center;";
  }
  if (align === "right") {
    return "margin-left: auto; margin-right: 0; text-align: right;";
  }
  return "margin-left: 0; margin-right: auto; text-align: left;";
}

function readAttr(tag: string, name: string): string {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')`,
    "i",
  );
  const match = tag.match(re);
  return (match?.[1] ?? match?.[2] ?? "").trim();
}

function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:\"[^\"]*\"|'[^']*')`, "i");
  if (re.test(tag)) {
    return tag.replace(re, `${name}="${escapeAttr(value)}"`);
  }
  return tag.replace(/<img\b/i, `<img ${name}="${escapeAttr(value)}"`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

/** First usable <img src> from HTML body content (for thumbnail fallbacks). */
export function extractFirstImageUrl(html: string): string {
  const images = extractContentImages(html);
  return images[0]?.url ?? "";
}

export type ContentImage = {
  id: string;
  url: string;
  alt: string;
};

/** Collect unique image URLs (http(s) or site-relative) from HTML, in document order. */
export function extractContentImages(html: string): ContentImage[] {
  if (!html?.trim()) return [];

  const images: ContentImage[] = [];
  const seen = new Set<string>();
  const imgTagRe = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgTagRe.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch =
      tag.match(/\bsrc\s*=\s*"([^"]+)"/i) ||
      tag.match(/\bsrc\s*=\s*'([^']+)'/i) ||
      tag.match(/\bsrc\s*=\s*([^\s>]+)/i);
    const altMatch =
      tag.match(/\balt\s*=\s*"([^"]*)"/i) ||
      tag.match(/\balt\s*=\s*'([^']*)'/i);

    const url = (srcMatch?.[1] ?? "").trim();
    if (!url || url.startsWith("data:") || seen.has(url)) continue;
    if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) continue;

    seen.add(url);
    images.push({
      id: `img-${images.length}`,
      url,
      alt: (altMatch?.[1] ?? "").trim(),
    });
  }

  return images;
}

export type ContentHlsVideo = {
  id: string;
  src: string;
  poster: string;
  title: string;
};

function readHtmlAttr(tag: string, name: string): string {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')`,
    "i",
  );
  const match = tag.match(re);
  return (match?.[1] ?? match?.[2] ?? "").trim();
}

/** Collect unique HLS playlist URLs from article HTML (`data-hls-src`). */
export function extractHlsVideos(html: string): ContentHlsVideo[] {
  if (!html?.trim()) return [];

  const videos: ContentHlsVideo[] = [];
  const seen = new Set<string>();

  // Prefer figure wrappers so we can read figcaption as title.
  const figureRe =
    /<figure\b[^>]*\bdata-type\s*=\s*["']hls-video["'][^>]*>[\s\S]*?<\/figure>/gi;
  let figureMatch: RegExpExecArray | null;
  while ((figureMatch = figureRe.exec(html)) !== null) {
    const figureHtml = figureMatch[0];
    const videoTag = figureHtml.match(/<video\b[^>]*>/i)?.[0];
    if (!videoTag) continue;
    const src = readHtmlAttr(videoTag, "data-hls-src");
    if (!src || seen.has(src)) continue;
    if (!/^https?:\/\//i.test(src) && !src.startsWith("/")) continue;
    const caption =
      figureHtml
        .match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1]
        ?.replace(/<[^>]*>/g, "")
        .trim() || "";
    seen.add(src);
    videos.push({
      id: `hls-${videos.length}`,
      src,
      poster: readHtmlAttr(videoTag, "poster"),
      title: caption || readHtmlAttr(videoTag, "title"),
    });
  }

  // Standalone video tags not already captured via figures.
  const videoRe = /<video\b[^>]*>/gi;
  let videoMatch: RegExpExecArray | null;
  while ((videoMatch = videoRe.exec(html)) !== null) {
    const tag = videoMatch[0];
    const src = readHtmlAttr(tag, "data-hls-src");
    if (!src || seen.has(src)) continue;
    if (!/^https?:\/\//i.test(src) && !src.startsWith("/")) continue;
    seen.add(src);
    videos.push({
      id: `hls-${videos.length}`,
      src,
      poster: readHtmlAttr(tag, "poster"),
      title: readHtmlAttr(tag, "title"),
    });
  }

  return videos;
}

/** First HLS playlist from HTML, if any. */
export function extractFirstHlsVideo(html: string): ContentHlsVideo | null {
  return extractHlsVideos(html)[0] ?? null;
}

/**
 * Set `poster` on every <video data-hls-src="src"> that is missing a poster.
 * Returns the updated HTML (unchanged when nothing was written).
 */
export function setHlsVideoPoster(
  html: string,
  src: string,
  posterUrl: string,
): string {
  const targetSrc = src.trim();
  const poster = posterUrl.trim();
  if (!html?.trim() || !targetSrc || !poster) return html;

  return html.replace(/<video\b[^>]*>/gi, (tag) => {
    const tagSrc = readHtmlAttr(tag, "data-hls-src");
    if (tagSrc !== targetSrc) return tag;
    const existing = readHtmlAttr(tag, "poster");
    if (existing) return tag;

    if (/\bposter\s*=/i.test(tag)) {
      return tag.replace(
        /\bposter\s*=\s*(?:\"[^\"]*\"|'[^']*')/i,
        `poster="${escapeAttr(poster)}"`,
      );
    }
    return tag.replace(/<video\b/i, `<video poster="${escapeAttr(poster)}"`);
  });
}

/** True when HTML has at least one HLS video missing a poster. */
export function htmlHasHlsVideoMissingPoster(html: string): boolean {
  return extractHlsVideos(html).some((video) => video.src && !video.poster);
}
