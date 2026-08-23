import { connectDb } from "@/lib/db";
import {
  listImportExportJobsPage,
  type ImportExportJobsPage,
} from "@/lib/import-export/jobs";
import {
  ImportExportJob,
  type ImportExportJobKind,
} from "@/models/ImportExportJob";

type JobSubscription = {
  kind: ImportExportJobKind;
  page: number;
  pageSize: number;
  listener: (page: ImportExportJobsPage) => void;
};

type ClosableStream = {
  close(): Promise<void>;
  on(event: "change", listener: (change: { fullDocument?: unknown }) => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
};

type JobStreamState = {
  subscriptions: Set<JobSubscription>;
  changeStream: ClosableStream | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  watcherPromise: Promise<void> | null;
  usePollingFallback: boolean;
};

const globalForJobStream = globalThis as unknown as {
  importExportJobStream?: JobStreamState;
};

function state(): JobStreamState {
  if (!globalForJobStream.importExportJobStream) {
    globalForJobStream.importExportJobStream = {
      subscriptions: new Set(),
      changeStream: null,
      pollTimer: null,
      debounceTimer: null,
      watcherPromise: null,
      usePollingFallback: false,
    };
  }
  return globalForJobStream.importExportJobStream;
}

function listenerKinds(): ImportExportJobKind[] {
  const kinds = new Set<ImportExportJobKind>();
  for (const sub of state().subscriptions) {
    kinds.add(sub.kind);
  }
  return [...kinds];
}

function hasAnyListeners(): boolean {
  return state().subscriptions.size > 0;
}

function resolveKindFromChange(doc: unknown): ImportExportJobKind | undefined {
  if (!doc || typeof doc !== "object") return undefined;
  const kind = (doc as { kind?: unknown }).kind;
  return kind === "import" || kind === "export" ? kind : undefined;
}

async function publishSubscription(sub: JobSubscription) {
  const page = await listImportExportJobsPage(sub.kind, sub.page, sub.pageSize);
  sub.listener(page);
}

async function publishKind(kind: ImportExportJobKind) {
  const subs = [...state().subscriptions].filter((sub) => sub.kind === kind);
  await Promise.all(subs.map((sub) => publishSubscription(sub)));
}

function schedulePublish(kind?: ImportExportJobKind) {
  const s = state();
  if (s.debounceTimer) clearTimeout(s.debounceTimer);
  s.debounceTimer = setTimeout(() => {
    s.debounceTimer = null;
    const kinds = kind ? [kind] : listenerKinds();
    void Promise.all(kinds.map((item) => publishKind(item)));
  }, 200);
}

function startPollingFallback() {
  const s = state();
  if (s.usePollingFallback && s.pollTimer) return;
  s.usePollingFallback = true;
  if (s.pollTimer) clearInterval(s.pollTimer);
  s.pollTimer = setInterval(() => {
    if (!hasAnyListeners()) return;
    schedulePublish();
  }, 4000);
}

function teardownWatcher() {
  const s = state();
  if (s.debounceTimer) {
    clearTimeout(s.debounceTimer);
    s.debounceTimer = null;
  }
  if (s.pollTimer) {
    clearInterval(s.pollTimer);
    s.pollTimer = null;
  }
  if (s.changeStream) {
    void s.changeStream.close().catch(() => undefined);
    s.changeStream = null;
  }
  s.watcherPromise = null;
  s.usePollingFallback = false;
}

async function startWatcher() {
  const s = state();
  if (s.changeStream || s.usePollingFallback) return;

  await connectDb();
  try {
    const changeStream = ImportExportJob.watch([], {
      fullDocument: "updateLookup",
    });
    s.changeStream = changeStream as unknown as ClosableStream;

    changeStream.on("change", (change) => {
      schedulePublish(resolveKindFromChange(change.fullDocument));
    });

    changeStream.on("error", () => {
      if (s.changeStream) {
        void s.changeStream.close().catch(() => undefined);
        s.changeStream = null;
      }
      startPollingFallback();
    });
  } catch {
    startPollingFallback();
  }
}

async function ensureWatcher() {
  const s = state();
  if (!s.watcherPromise) {
    s.watcherPromise = startWatcher();
  }
  await s.watcherPromise;
}

export function subscribeImportExportJobs(
  kind: ImportExportJobKind,
  page: number,
  pageSize: number,
  listener: (page: ImportExportJobsPage) => void,
): () => void {
  const sub: JobSubscription = { kind, page, pageSize, listener };
  state().subscriptions.add(sub);
  void ensureWatcher();

  return () => {
    state().subscriptions.delete(sub);
    if (!hasAnyListeners()) {
      teardownWatcher();
    }
  };
}

export function formatSseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
