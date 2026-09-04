import {
  ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  ADMIN_JOBS_PAGE_SIZES,
  type AdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";

export const IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE = ADMIN_JOBS_DEFAULT_PAGE_SIZE;
export const IMPORT_EXPORT_JOBS_PAGE_SIZES = ADMIN_JOBS_PAGE_SIZES;
export type ImportExportJobsPageSize = AdminJobsPageSize;

export type ImportExportJobKind = "import" | "export";
export type ImportExportJobStatus =
  | "queued"
  | "running"
  | "cancelled"
  | "succeeded"
  | "failed";
export type ImportExportJobTrigger = "manual" | "scheduled";

export type AdminImportExportJob = {
  id: string;
  kind: ImportExportJobKind;
  status: ImportExportJobStatus;
  trigger: ImportExportJobTrigger;
  requestedByEmail: string;
  requestedByName: string;
  phase: string;
  message: string;
  error: string;
  commitSha: string;
  htmlUrl: string;
  stats: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
};

export type ImportExportJobsPage = {
  jobs: AdminImportExportJob[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function parseImportExportJobsPageSize(
  raw: string | null | undefined,
): ImportExportJobsPageSize {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (
    IMPORT_EXPORT_JOBS_PAGE_SIZES.includes(
      parsed as ImportExportJobsPageSize,
    )
  ) {
    return parsed as ImportExportJobsPageSize;
  }
  return IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE;
}

export function parseImportExportJobsPage(
  raw: string | null | undefined,
): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function emptyImportExportJobsPage(
  page = 1,
  pageSize: number = IMPORT_EXPORT_JOBS_DEFAULT_PAGE_SIZE,
): ImportExportJobsPage {
  return {
    jobs: [],
    total: 0,
    page,
    pageSize,
    totalPages: 1,
  };
}
