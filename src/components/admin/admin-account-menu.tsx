"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export type AdminAccountUser = {
  name: string | null;
  email: string | null;
  callsign: string;
};

type Props = {
  user: AdminAccountUser;
  signOutAction: () => Promise<void>;
  compact?: boolean;
};

export function AdminAccountMenu({
  user,
  signOutAction,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const displayName = user.name?.trim() || user.email || "Account";
  const profileHref = user.callsign ? `/${user.callsign}` : "/account";

  function onLogout() {
    startTransition(async () => {
      await signOutAction();
    });
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={`inline-flex min-w-0 items-center gap-2 rounded-md text-left text-sm text-gray-800 outline-none transition hover:bg-gray-50 data-[state=open]:bg-gray-50 ${
            compact
              ? "h-9 justify-center px-2"
              : "max-w-[16rem] px-2 py-1.5"
          }`}
          aria-label="Account menu"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-gray-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 19.5c1.8-3.2 4.2-4.5 7-4.5s5.2 1.3 7 4.5" />
          </svg>
          {compact ? (
            <span className="sr-only">{displayName}</span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium leading-tight">
                {displayName}
              </span>
              {user.email && user.name?.trim() ? (
                <span className="block truncate text-xs leading-tight text-gray-500">
                  {user.email}
                </span>
              ) : null}
            </span>
          )}
          <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="admin-account-menu-content z-50 min-w-[14rem] origin-top-right rounded-md border border-gray-200 bg-white p-1 shadow-md outline-none"
        >
          <div className="border-b border-gray-200 px-3 py-2">
            <p className="truncate text-sm font-medium text-gray-900">
              {displayName}
            </p>
            {user.email ? (
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            ) : null}
          </div>

          <DropdownMenu.Item asChild>
            <Link
              href={profileHref}
              prefetch={false}
              className="mt-1 flex cursor-pointer select-none items-center gap-2.5 rounded px-3 py-2 text-sm text-gray-800 outline-none transition hover:bg-gray-50 data-[highlighted]:bg-gray-50"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0 text-gray-500"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="8" cy="5.25" r="2.25" />
                <path d="M3.5 13c1.15-2.15 2.65-3.1 4.5-3.1s3.35.95 4.5 3.1" />
              </svg>
              My Profile
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

          <DropdownMenu.Item
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              onLogout();
            }}
            className="flex cursor-pointer select-none items-center rounded px-3 py-2 text-sm text-gray-800 outline-none transition hover:bg-gray-50 data-[highlighted]:bg-gray-50 data-[disabled]:opacity-50"
          >
            {pending ? "…" : "Sign out"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
