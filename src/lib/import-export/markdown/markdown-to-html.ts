import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { sanitizeHtml } from "@/lib/html";
import { normalizeImportedText } from "@/lib/import-export/markdown/parse-sections";

export async function markdownToHtml(markdown: string): Promise<string> {
  const trimmed = normalizeImportedText(markdown);
  if (!trimmed) return "";

  const file = await remark()
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeStringify)
    .process(trimmed);

  return sanitizeHtml(String(file));
}
