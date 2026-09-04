export const ADMIN_JOBS_DEFAULT_PAGE_SIZE = 10;
export const ADMIN_JOBS_PAGE_SIZES = [10, 20, 50] as const;
export type AdminJobsPageSize = (typeof ADMIN_JOBS_PAGE_SIZES)[number];

export type AdminJobsPageMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function parseAdminJobsPageSize(
  raw: string | null | undefined,
): AdminJobsPageSize {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (ADMIN_JOBS_PAGE_SIZES.includes(parsed as AdminJobsPageSize)) {
    return parsed as AdminJobsPageSize;
  }
  return ADMIN_JOBS_DEFAULT_PAGE_SIZE;
}

export function parseAdminJobsPage(raw: string | null | undefined): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeAdminJobsPage(
  page: number,
  pageSize: number,
  total: number,
): AdminJobsPageMeta {
  const safePageSize = Math.max(
    1,
    Math.min(pageSize, Math.max(...ADMIN_JOBS_PAGE_SIZES)),
  );
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / safePageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);
  return {
    total: Math.max(0, total),
    page: normalizedPage,
    pageSize: safePageSize,
    totalPages,
  };
}

export function adminJobsPageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  return [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
}
