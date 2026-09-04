import { Suspense } from "react";
import Link from "next/link";
import { requireCallsignsPage } from "@/lib/admin-access";
import { deleteCallsignAction } from "@/lib/callsign-actions";
import {
  getCallsignImportSummary,
  listAdminCallsignsPage,
} from "@/lib/callsigns-admin";
import {
  parseOperatorKindFilter,
  parsePermitTypeFilter,
} from "@/lib/callsigns-filters";
import {
  parseAdminJobsPage,
  parseAdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { CallsignListFilters } from "@/components/admin/callsign-list-filters";
import { CallsignListToolbar } from "@/components/admin/callsign-list-toolbar";
import { ActiveRowActions } from "@/components/admin/active-row-actions";
import { formatDateUtc7 } from "@/lib/datetime-local";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    q?: string;
    operatorKind?: string;
    permitType?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function AdminCallsignsPage({ searchParams }: Props) {
  await requireCallsignsPage();
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const operatorKind = parseOperatorKindFilter(params.operatorKind);
  const permitType = parsePermitTypeFilter(params.permitType);
  const page = parseAdminJobsPage(params.page);
  const pageSize = parseAdminJobsPageSize(params.pageSize);
  const filtered =
    Boolean(query) || operatorKind !== "all" || permitType !== "all";
  const [listPage, summary] = await Promise.all([
    listAdminCallsignsPage({
      q: query,
      operatorKind,
      permitType,
      page,
      pageSize,
    }),
    getCallsignImportSummary(),
  ]);
  const items = listPage.items;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Callsigns</h1>
          <p className="mt-1 text-sm text-gray-600">
            Import the historical Excel workbook, then create or edit hô hiệu
            and license events. Public lookup reads this directory.
          </p>
        </div>
        <CallsignListToolbar lastImport={summary.lastImport} />
      </div>

      <CallsignListFilters
        q={query}
        operatorKind={operatorKind}
        permitType={permitType}
      />

      {listPage.total === 0 ? (
        <p className="text-gray-600">
          {filtered
            ? "No callsigns match that search or filter."
            : "No callsigns yet. Import the Excel file or create one."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Callsign</th>
                <th className="px-4 py-3 font-medium">Operator</th>
                <th className="px-4 py-3 font-medium">Permit</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.sign} className="border-b border-gray-100">
                  <td className="px-4 py-3 font-mono font-medium">
                    <Link
                      href={`/admin/callsigns/${item.sign}`}
                      className="hover:underline"
                    >
                      {item.sign}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{item.operatorName || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.permitRaw || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDateUtc7(item.expiresAt, "en-GB") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        item.status === "valid"
                          ? "text-green-700"
                          : item.status === "expired"
                            ? "text-gray-500"
                            : "text-amber-700"
                      }
                    >
                      {item.status}
                    </span>
                    {item.eventCount > 1 ? (
                      <span className="ml-2 text-xs text-gray-400">
                        {item.eventCount} events
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ActiveRowActions
                      editHref={`/admin/callsigns/${item.sign}`}
                      deleteAction={deleteCallsignAction.bind(null, item.sign)}
                      deleteLabel="Delete"
                      deleteConfirmTitle="Delete callsign"
                      deleteConfirmMessage={`Permanently delete ${item.sign} and its license events?`}
                      deleteConfirmLabel="Delete"
                      deleteSuccessMessage="Callsign deleted"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-gray-100 md:hidden">
            {items.map((item) => (
              <li key={item.sign} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/admin/callsigns/${item.sign}`}
                      className="font-mono font-medium hover:underline"
                    >
                      {item.sign}
                    </Link>
                    <p className="mt-0.5 text-sm text-gray-600">
                      {item.operatorName || "—"}
                    </p>
                  </div>
                  <ActiveRowActions
                    editHref={`/admin/callsigns/${item.sign}`}
                    deleteAction={deleteCallsignAction.bind(null, item.sign)}
                    deleteLabel="Delete"
                    deleteConfirmTitle="Delete callsign"
                    deleteConfirmMessage={`Permanently delete ${item.sign}?`}
                    deleteConfirmLabel="Delete"
                    deleteSuccessMessage="Callsign deleted"
                  />
                </div>
              </li>
            ))}
          </ul>

          <Suspense fallback={null}>
            <AdminListPagination
              page={listPage.page}
              pageSize={listPage.pageSize}
              total={listPage.total}
              totalPages={listPage.totalPages}
              label="Callsigns"
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
