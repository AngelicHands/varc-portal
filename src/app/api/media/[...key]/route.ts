import { Readable } from "node:stream";
import { getObjectStream } from "@/lib/media/storage";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ key: string[] }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { key: parts } = await params;
    const key = parts.map(decodeURIComponent).join("/");
    if (!key) {
      return new Response("Not found", { status: 404 });
    }

    // Always proxy through the app so `/media/{key}` works for private
    // buckets (redirect to S3_PUBLIC_URL fails with AccessDenied).
    const { stream, contentType, size } = await getObjectStream(key);
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(typeof size === "number"
          ? { "Content-Length": String(size) }
          : {}),
        "Cache-Control": "public, max-age=31536000, immutable",
        // Mitigate XSS if a text/html or svg slips through misconfiguration.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Not found";
    const status =
      message === "Not found" || message === "Invalid media key" ? 404 : 500;
    if (status === 500) logServerError("media get", error);
    return new Response(status === 404 ? "Not found" : "Failed to load media", {
      status,
    });
  }
}
