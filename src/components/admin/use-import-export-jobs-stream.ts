"use client";

import { useEffect, useState } from "react";
import {
  type ImportExportJobsPage,
} from "@/lib/import-export/jobs-shared";
import type { ImportExportJobKind } from "@/lib/import-export/jobs-shared";

export function useImportExportJobsStream(
  kind: ImportExportJobKind,
  initialPage: ImportExportJobsPage,
  page: number,
  pageSize: number,
) {
  const [data, setData] = useState(initialPage);

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams({
      kind,
      page: String(page),
      pageSize: String(pageSize),
    });
    const source = new EventSource(
      `/api/admin/import-export/jobs/stream?${params.toString()}`,
    );

    source.addEventListener("jobs", (event) => {
      if (disposed) return;
      try {
        const payload = JSON.parse(event.data) as ImportExportJobsPage;
        if (Array.isArray(payload.jobs)) {
          setData(payload);
        }
      } catch {
        // Ignore malformed payloads.
      }
    });

    return () => {
      disposed = true;
      source.close();
    };
  }, [kind, page, pageSize]);

  return { ...data, setData };
}
