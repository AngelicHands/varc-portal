import { AdminCommentsManager } from "@/components/admin/admin-comments-manager";
import { requireEditorialPage } from "@/lib/admin-access";
import {
  parseAdminJobsPage,
  parseAdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";
import { listAdminArticleCommentsPage } from "@/lib/article-comments";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function AdminCommentsPage({ searchParams }: Props) {
  await requireEditorialPage();
  const params = await searchParams;
  const statusRaw = params.status?.trim() || "pending";
  const status =
    statusRaw === "published" ||
    statusRaw === "rejected" ||
    statusRaw === "all" ||
    statusRaw === "pending"
      ? statusRaw
      : "pending";

  const page = parseAdminJobsPage(params.page);
  const pageSize = parseAdminJobsPageSize(params.pageSize);
  const listPage = await listAdminArticleCommentsPage({
    status,
    page,
    pageSize,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Comments</h1>
      <p className="mt-1 text-sm text-gray-600">
        Review and moderate article comments. Pending items appear when an
        article uses Moderated mode.
      </p>
      <div className="mt-6">
        <AdminCommentsManager
          comments={listPage.items}
          statusFilter={status}
          page={listPage.page}
          pageSize={listPage.pageSize}
          total={listPage.total}
          totalPages={listPage.totalPages}
        />
      </div>
    </div>
  );
}
