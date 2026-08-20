"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createUserAction,
  updateAdminUserAction,
} from "@/lib/actions";
import type { PublicRole } from "@/lib/app-roles";
import type { Role } from "@/lib/roles";
import { notifyAction } from "@/components/admin/admin-toast";

type EditableUser = {
  id: string;
  name: string;
  email: string;
  callsign: string;
  callsignVerified: boolean;
  role: string;
};

type Props = {
  open: boolean;
  roles: PublicRole[];
  user?: EditableUser;
  onClose: () => void;
};

export function CreateUserModal({ open, roles, user, onClose }: Props) {
  const router = useRouter();
  const titleId = useId();
  const editing = Boolean(user);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [callsign, setCallsign] = useState(user?.callsign ?? "");
  const [callsignVerified, setCallsignVerified] = useState(
    Boolean(user?.callsignVerified),
  );
  const defaultRole =
    (user?.role as Role | undefined) ||
    (roles.find((role) => role.key === "administrator")?.key as Role) ||
    (roles[0]?.key as Role) ||
    "administrator";
  const [role, setRole] = useState<Role>(defaultRole);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, pending, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={pending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-xl font-semibold text-gray-900">
            {editing ? "Edit user" : "Create user"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="cursor-pointer rounded border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form
          className="mt-5 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = editing && user
                ? await updateAdminUserAction(user.id, {
                    name,
                    callsign,
                    callsignVerified:
                      Boolean(callsign.trim()) && callsignVerified,
                  })
                : await createUserAction({
                    name,
                    email,
                    password,
                    role,
                    callsign,
                    callsignVerified:
                      Boolean(callsign.trim()) && callsignVerified,
                  });
              if (
                !notifyAction(
                  result,
                  editing ? "User updated" : "User created",
                )
              ) {
                setError(result.error);
                return;
              }
              router.refresh();
              onClose();
            });
          }}
        >
          {error ? (
            <p className="md:col-span-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={editing}
              className={`w-full rounded border border-gray-300 px-3 py-2 ${
                editing ? "bg-gray-50 text-gray-600" : ""
              }`}
            />
          </label>
          {editing ? null : (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Callsign</span>
            <input
              value={callsign}
              onChange={(e) => {
                const next = e.target.value.toUpperCase();
                setCallsign(next);
                if (!next.trim()) setCallsignVerified(false);
              }}
              placeholder="XV1ABC"
              className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Callsign status</span>
            <select
              value={callsignVerified ? "verified" : "not_verified"}
              disabled={!callsign.trim()}
              onChange={(e) =>
                setCallsignVerified(e.target.value === "verified")
              }
              className="w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="not_verified">Not verified</option>
              <option value="verified">Verified</option>
            </select>
          </label>
          {editing ? null : (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                {roles.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="md:col-span-2 mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {pending
                ? editing
                  ? "Saving…"
                  : "Creating…"
                : editing
                  ? "Save user"
                  : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
