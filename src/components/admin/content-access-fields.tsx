"use client";

import { AdminCheckbox } from "@/components/admin/admin-checkbox";
import { CategoryCheckboxDropdown } from "@/components/admin/category-checkbox-dropdown";

export type ContentAccessFormValue = {
  allowPublic: boolean;
  allowedUserIds: string[];
  allowedRoleKeys: string[];
};

type Option = { id: string; label: string };

type Props = {
  value: ContentAccessFormValue;
  onChange: (next: ContentAccessFormValue) => void;
  userOptions: Option[];
  roleOptions: Option[];
  compact?: boolean;
};

export function ContentAccessFields({
  value,
  onChange,
  userOptions,
  roleOptions,
  compact = false,
}: Props) {
  return (
    <div className={compact ? "grid min-w-0 gap-4" : "grid gap-4"}>
      <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm">
        <AdminCheckbox
          className="mt-0.5"
          checked={value.allowPublic}
          onChange={(e) =>
            onChange({ ...value, allowPublic: e.target.checked })
          }
        />
        <span className="min-w-0">
          <span className="block font-medium text-gray-900">
            Public access
          </span>
          <span className="mt-0.5 block text-xs text-gray-500">
            Anonymous visitors can view when published. Turn off to require a
            signed-in account.
          </span>
        </span>
      </label>

      {!value.allowPublic ? (
        <>
          <div className="min-w-0">
            <p className="mb-1 text-sm font-medium text-gray-900">
              Allow specific users
            </p>
            <p className="mb-3 text-xs text-gray-600">
              Leave empty to allow all signed-in users (unless roles are set).
            </p>
            <CategoryCheckboxDropdown
              options={userOptions}
              value={value.allowedUserIds}
              onChange={(allowedUserIds) =>
                onChange({ ...value, allowedUserIds })
              }
              placeholder="All signed-in users"
              emptyLabel="No users found."
            />
          </div>

          <div className="min-w-0">
            <p className="mb-1 text-sm font-medium text-gray-900">
              Allow specific roles
            </p>
            <p className="mb-3 text-xs text-gray-600">
              Leave empty to allow all roles (unless users are set). A viewer
              matches if they are in the user list or have one of these roles.
            </p>
            <CategoryCheckboxDropdown
              options={roleOptions}
              value={value.allowedRoleKeys}
              onChange={(allowedRoleKeys) =>
                onChange({ ...value, allowedRoleKeys })
              }
              placeholder="All roles"
              emptyLabel="No roles found."
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
