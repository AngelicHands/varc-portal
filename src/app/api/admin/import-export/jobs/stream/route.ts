import { requireSiteAdminApi } from "@/lib/admin-api";
import {
  formatSseMessage,
  subscribeImportExportJobs,
} from "@/lib/import-export/job-stream";
import {
  listImportExportJobsPage,
  parseImportExportJobsPage,
  parseImportExportJobsPageSize,
} from "@/lib/import-export/jobs";
import { canManageImportExport } from "@/lib/roles";
import type { ImportExportJobKind } from "@/models/ImportExportJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const session = await requireSiteAdminApi();
  if (!session || !canManageImportExport(session.user)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  if (kindParam !== "import" && kindParam !== "export") {
    return new Response("Invalid kind", { status: 400 });
  }
  const kind = kindParam as ImportExportJobKind;
  const page = parseImportExportJobsPage(url.searchParams.get("page"));
  const pageSize = parseImportExportJobsPageSize(
    url.searchParams.get("pageSize"),
  );

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(formatSseMessage(event, data)));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        unsubscribe = null;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      try {
        const initialPage = await listImportExportJobsPage(kind, page, pageSize);
        send("jobs", initialPage);
      } catch {
        send("error", { message: "Failed to load jobs" });
        close();
        return;
      }

      unsubscribe = subscribeImportExportJobs(kind, page, pageSize, (nextPage) => {
        send("jobs", nextPage);
      });

      heartbeat = setInterval(() => {
        send("heartbeat", {});
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      unsubscribe = null;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
