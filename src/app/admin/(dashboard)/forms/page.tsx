import Link from "next/link";
import {
  deleteFormDefinitionAction,
  emptyFormsTrashAction,
  permanentlyDeleteFormDefinitionAction,
  restoreFormDefinitionAction,
} from "@/lib/actions";
import { requireSitePage } from "@/lib/admin-access";
import {
  countNewFormSubmissions,
  listForms,
} from "@/lib/forms";
import { AdminListTabs } from "@/components/admin/admin-list-tabs";
import { ActiveRowActions } from "@/components/admin/active-row-actions";
import { EmptyTrashButton } from "@/components/admin/empty-trash-button";
import { TrashRowActions } from "@/components/admin/trash-row-actions";
import { PORTAL_TIMEZONE } from "@/lib/datetime-local";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

function formatAdminDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: PORTAL_TIMEZONE,
  });
}

export default async function AdminFormsPage({ searchParams }: Props) {
  await requireSitePage();
  const { tab } = await searchParams;
  const trash = tab === "trash";

  const [activeForms, trashForms] = await Promise.all([
    listForms(),
    listForms({ trash: true }),
  ]);
  const items = trash ? trashForms : activeForms;
  const unreadCounts = trash
    ? new Map<string, number>()
    : new Map<string, number>(
        await Promise.all(
          activeForms.map(
            async (form): Promise<[string, number]> => [
              form.id,
              await countNewFormSubmissions(form.id),
            ],
          ),
        ),
      );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Forms</h1>
          <p className="mt-1 text-sm text-gray-600">
            Reusable forms for page and template layouts.
          </p>
        </div>
        {trash ? (
          <EmptyTrashButton
            count={trashForms.length}
            itemLabel="forms"
            emptyAction={emptyFormsTrashAction}
          />
        ) : (
          <Link
            href="/admin/forms/new"
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            New form
          </Link>
        )}
      </div>

      <AdminListTabs
        basePath="/admin/forms"
        active={trash ? "trash" : "active"}
        activeCount={activeForms.length}
        trashCount={trashForms.length}
      />

      {items.length === 0 ? (
        <p className="mt-8 text-gray-600">
          {trash ? "Trash is empty." : "No forms yet."}
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Fields</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">
                  {trash ? "Deleted" : "Updated"}
                </th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((form) => (
                <tr key={form.id} className="border-b border-gray-100">
                  <td className="px-4 py-3">
                    {trash ? (
                      <span className="font-medium">{form.name}</span>
                    ) : (
                      <Link
                        href={`/admin/forms/${form.id}`}
                        className="font-medium hover:underline"
                      >
                        {form.name}
                      </Link>
                    )}
                    {form.description ? (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {form.description}
                      </p>
                    ) : null}
                    {!trash && (unreadCounts.get(form.id) ?? 0) > 0 ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        {unreadCounts.get(form.id)} new submission(s)
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {form.key}
                  </td>
                  <td className="px-4 py-3">{form.fieldCount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        form.status === "published"
                          ? "text-green-700"
                          : "text-amber-700"
                      }
                    >
                      {form.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatAdminDate(trash ? form.deletedAt : form.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {trash ? (
                      <TrashRowActions
                        restoreAction={restoreFormDefinitionAction.bind(
                          null,
                          form.id,
                        )}
                        deleteAction={permanentlyDeleteFormDefinitionAction.bind(
                          null,
                          form.id,
                        )}
                        itemLabel={form.name || "this form"}
                      />
                    ) : (
                      <ActiveRowActions
                        editHref={`/admin/forms/${form.id}`}
                        deleteAction={deleteFormDefinitionAction.bind(
                          null,
                          form.id,
                        )}
                        deleteConfirmMessage="Move this form to trash?"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-gray-100 md:hidden">
            {items.map((form) => (
              <li key={form.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {trash ? (
                      <p className="font-medium">{form.name}</p>
                    ) : (
                      <Link
                        href={`/admin/forms/${form.id}`}
                        className="font-medium hover:underline"
                      >
                        {form.name}
                      </Link>
                    )}
                    <p className="mt-0.5 font-mono text-xs text-gray-500">
                      {form.key}
                    </p>
                  </div>
                  {trash ? (
                    <TrashRowActions
                      restoreAction={restoreFormDefinitionAction.bind(
                        null,
                        form.id,
                      )}
                      deleteAction={permanentlyDeleteFormDefinitionAction.bind(
                        null,
                        form.id,
                      )}
                      itemLabel={form.name || "this form"}
                    />
                  ) : (
                    <ActiveRowActions
                      editHref={`/admin/forms/${form.id}`}
                      deleteAction={deleteFormDefinitionAction.bind(null, form.id)}
                      deleteConfirmMessage="Move this form to trash?"
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                  <span>{form.fieldCount} fields</span>
                  <span
                    className={
                      form.status === "published"
                        ? "text-green-700"
                        : "text-amber-700"
                    }
                  >
                    {form.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
