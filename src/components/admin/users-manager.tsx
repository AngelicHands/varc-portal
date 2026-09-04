"use client";

import { useMemo, useState } from "react";
import NextLink from "next/link";
import { AdminJobsPagination } from "@/components/admin/admin-jobs-pagination";
import { CreateUserModal } from "@/components/admin/create-user-form";
import { UserRoleControls } from "@/components/admin/user-role-controls";
import type { PublicRole } from "@/lib/app-roles";
import {
  ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  normalizeAdminJobsPage,
  type AdminJobsPageSize,
} from "@/lib/admin-jobs-pagination";

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  callsign: string;
  callsignVerified: boolean;
  role: string;
  createdAt: string;
  editable: boolean;
};

type SortKey = "name" | "email" | "callsign" | "role" | "createdAt";
type SortDir = "asc" | "desc";

type Props = {
  initialUsers: AdminUserListItem[];
  allRoles: PublicRole[];
  rolesForActor: PublicRole[];
  canCreate: boolean;
  canManage: boolean;
};

function sortIndicator(active: boolean, dir: SortDir): string {
  if (!active) return "↕";
  return dir === "asc" ? "↑" : "↓";
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN");
}

function SortHeader({
  column,
  label,
  sortKey,
  sortDir,
  onSort,
}: {
  column: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 hover:text-gray-900"
      >
        {label}
        <span className="text-xs text-gray-400">
          {sortIndicator(sortKey === column, sortDir)}
        </span>
      </button>
    </th>
  );
}

export function UsersManager({
  initialUsers,
  allRoles,
  rolesForActor,
  canCreate,
  canManage,
}: Props) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<AdminJobsPageSize>(
    ADMIN_JOBS_DEFAULT_PAGE_SIZE,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserListItem | null>(
    null,
  );

  const roleLabelByKey = useMemo(
    () => new Map(allRoles.map((role) => [role.key, role.label])),
    [allRoles],
  );

  function toggleSort(key: SortKey) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "createdAt" ? "desc" : "asc");
  }

  const filteredSorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    let items = initialUsers;

    if (roleFilter !== "all") {
      items = items.filter((user) => user.role === roleFilter);
    }

    if (query) {
      items = items.filter((user) => {
        const roleLabel = roleLabelByKey.get(user.role) || user.role;
        const haystack = [user.name, user.email, user.callsign, roleLabel]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    return [...items].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") {
        cmp = a.createdAt.localeCompare(b.createdAt);
      } else if (sortKey === "role") {
        const aLabel = roleLabelByKey.get(a.role) || a.role;
        const bLabel = roleLabelByKey.get(b.role) || b.role;
        cmp = aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey], undefined, {
          sensitivity: "base",
        });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [initialUsers, roleFilter, search, sortDir, sortKey, roleLabelByKey]);

  const pageMeta = normalizeAdminJobsPage(page, pageSize, filteredSorted.length);
  const pageItems = filteredSorted.slice(
    (pageMeta.page - 1) * pageMeta.pageSize,
    pageMeta.page * pageMeta.pageSize,
  );

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, callsign…"
            className="min-w-[16rem] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            {allRoles.map((role) => (
              <option key={role.key} value={role.key}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            /* eslint-disable-next-line @next/next/no-html-link-for-pages */
            <a
              href="/api/admin/qso/export"
              className="inline-flex rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Export all QSOs (ADIF)
            </a>
          ) : null}
          {canCreate ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              New user
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-gray-600">
        {filteredSorted.length} of {initialUsers.length} user
        {initialUsers.length === 1 ? "" : "s"}
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
            <tr>
              <SortHeader
                column="name"
                label="Name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                column="email"
                label="Email"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                column="callsign"
                label="Callsign"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                column="role"
                label="Role"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                column="createdAt"
                label="Created"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-gray-600"
                >
                  {initialUsers.length === 0
                    ? "No users yet."
                    : "No users match this search or filter."}
                </td>
              </tr>
            ) : (
              pageItems.map((user) => (
                <tr key={user.id} className="border-b border-gray-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <NextLink
                        href={`/admin/users/${user.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {user.name}
                      </NextLink>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setEditingUser(user)}
                          className="text-xs font-medium text-gray-600 hover:underline"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.callsign.trim() ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                          user.callsignVerified
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {user.callsign}
                        <span className="font-normal normal-case">
                          {user.callsignVerified
                            ? "verified"
                            : "not verified"}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.editable ? (
                      <UserRoleControls
                        userId={user.id}
                        role={user.role}
                        roles={rolesForActor}
                      />
                    ) : (
                      <span>
                        {roleLabelByKey.get(user.role) || user.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(user.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <AdminJobsPagination
          page={pageMeta.page}
          pageSize={pageMeta.pageSize as AdminJobsPageSize}
          total={pageMeta.total}
          totalPages={pageMeta.totalPages}
          label="Users"
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
        />
      </div>

      {canCreate && createOpen ? (
        <CreateUserModal
          open
          roles={allRoles}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      {canManage && editingUser ? (
        <CreateUserModal
          open
          roles={allRoles}
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      ) : null}
    </div>
  );
}
