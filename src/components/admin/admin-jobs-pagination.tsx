"use client";

import {
  ADMIN_JOBS_PAGE_SIZES,
  adminJobsPageNumbers,
  type AdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";

type Props = {
  page: number;
  pageSize: AdminJobsPageSize;
  total: number;
  totalPages: number;
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: AdminJobsPageSize) => void;
};

export function AdminJobsPagination({
  page,
  pageSize,
  total,
  totalPages,
  label,
  onPageChange,
  onPageSizeChange,
}: Props) {
  if (total <= 0) return null;

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
        <span>
          Showing {rangeStart}–{rangeEnd} of {total}
        </span>
        <label className="flex items-center gap-2">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(event) => {
              onPageSizeChange(
                Number(event.target.value) as AdminJobsPageSize,
              );
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            {ADMIN_JOBS_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center gap-1"
          aria-label={`${label} pagination`}
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:pointer-events-none disabled:opacity-40"
          >
            Previous
          </button>
          {adminJobsPageNumbers(page, totalPages)
            .reduce<Array<number | "gap">>((acc, pageNumber, index, list) => {
              if (index > 0 && pageNumber - list[index - 1]! > 1) {
                acc.push("gap");
              }
              acc.push(pageNumber);
              return acc;
            }, [])
            .map((item, index) =>
              item === "gap" ? (
                <span
                  key={`gap-${index}`}
                  className="px-1 text-sm text-gray-400"
                >
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  aria-current={item === page ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    item === page
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {item}
                </button>
              ),
            )}
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:pointer-events-none disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
