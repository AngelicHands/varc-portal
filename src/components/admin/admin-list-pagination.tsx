"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminJobsPagination } from "@/components/admin/admin-jobs-pagination";
import type { AdminJobsPageSize } from "@/lib/admin-jobs-pagination";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  label: string;
  /** Query param for page number (default: page). */
  pageParam?: string;
  /** Query param for page size (default: pageSize). */
  pageSizeParam?: string;
};

export function AdminListPagination({
  page,
  pageSize,
  total,
  totalPages,
  label,
  pageParam = "page",
  pageSizeParam = "pageSize",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(nextPage: number, nextPageSize: AdminJobsPageSize) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete(pageParam);
    else params.set(pageParam, String(nextPage));
    if (nextPageSize === 10) params.delete(pageSizeParam);
    else params.set(pageSizeParam, String(nextPageSize));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <AdminJobsPagination
      page={page}
      pageSize={pageSize as AdminJobsPageSize}
      total={total}
      totalPages={totalPages}
      label={label}
      onPageChange={(next) => navigate(next, pageSize as AdminJobsPageSize)}
      onPageSizeChange={(nextSize) => navigate(1, nextSize)}
    />
  );
}
