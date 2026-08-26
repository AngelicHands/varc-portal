/**
 * One-off: rewrite private S3 absolute URLs stored by CMS import to
 * canonical `/media/{key}` paths (same as admin uploads).
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/repair-imported-media-urls.ts
 */
import { connectDb } from "@/lib/db";
import { parseMediaKeyFromUrl } from "@/lib/import-export/media-url";
import { getMediaConfig } from "@/lib/media/config";
import { canonicalMediaPath } from "@/lib/media/types";
import { Article } from "@/models/Article";
import { Media } from "@/models/Media";

function rewriteUrl(value: string, s3Prefix: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/media/")) return trimmed;

  if (s3Prefix && trimmed.startsWith(s3Prefix)) {
    return canonicalMediaPath(trimmed.slice(s3Prefix.length).replace(/^\/+/, ""));
  }

  const key = parseMediaKeyFromUrl(trimmed);
  if (key) return canonicalMediaPath(key);
  return trimmed;
}

function rewriteHtml(html: string, s3Prefix: string): string {
  let next = html;
  if (s3Prefix) {
    next = next.split(s3Prefix).join("/media/");
  }
  return next.replace(/https?:\/\/[^"'>\s]+/gi, (url) => rewriteUrl(url, s3Prefix));
}

async function main() {
  await connectDb();
  const config = getMediaConfig();
  const s3Prefix =
    config.driver === "s3"
      ? `${config.publicUrl.replace(/\/$/, "")}/`
      : "";

  let mediaFixed = 0;
  const mediaDocs = await Media.find({ url: { $regex: /^https?:\/\//i } }).lean();
  for (const doc of mediaDocs) {
    const key = String(doc.key || "");
    if (!key) continue;
    const url = canonicalMediaPath(key);
    if (url === doc.url) continue;
    await Media.updateOne({ _id: doc._id }, { $set: { url } });
    mediaFixed += 1;
  }

  let articlesFixed = 0;
  const articles = await Article.find({}).lean();
  for (const article of articles) {
    const set: Record<string, string> = {};

    for (const field of ["coverImageUrl", "ogImageUrl"] as const) {
      const current = article[field];
      if (typeof current !== "string" || !current) continue;
      const next = rewriteUrl(current, s3Prefix);
      if (next !== current) set[field] = next;
    }

    for (const locale of ["vi", "en"] as const) {
      const content = article.locales?.[locale]?.content;
      if (typeof content !== "string" || !content) continue;
      if (!/https?:\/\//i.test(content) && !(s3Prefix && content.includes(s3Prefix))) {
        continue;
      }
      const next = rewriteHtml(content, s3Prefix);
      if (next !== content) set[`locales.${locale}.content`] = next;
    }

    if (Object.keys(set).length === 0) continue;
    await Article.updateOne({ _id: article._id }, { $set: set });
    articlesFixed += 1;
  }

  console.log(
    JSON.stringify(
      {
        mediaFixed,
        articlesFixed,
        s3Host: s3Prefix ? new URL(s3Prefix).host : null,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
