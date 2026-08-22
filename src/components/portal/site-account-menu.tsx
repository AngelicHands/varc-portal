"use client";

import { useState, useTransition } from "react";
import NextLink from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useLocale, useTranslations } from "next-intl";
import { signOutAction } from "@/lib/actions";

export type SiteAccountUser = {
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  callsign: string;
};

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
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
  );
}

export function SiteAccountMenu({
  user,
  compact = false,
  overlayTone,
}: {
  user: SiteAccountUser | null;
  compact?: boolean;
  /** When set (map overlay), style the trigger for light/dark basemap panels. */
  overlayTone?: "light" | "dark";
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const loginHref = `/admin/login?callbackUrl=${encodeURIComponent(`/${locale}/account`)}`;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const loginClass =
    overlayTone === "dark"
      ? "shrink-0 text-sm text-white/70 transition hover:text-white"
      : overlayTone === "light"
        ? "shrink-0 text-sm text-zinc-600 transition hover:text-zinc-900"
        : "shrink-0 text-sm text-muted transition hover:text-foreground";

  const compactTriggerClass =
    overlayTone === "dark"
      ? "inline-flex h-10 items-center gap-1.5 rounded-md border border-white/20 px-2.5 text-sm text-white outline-none transition hover:bg-white/10 data-[state=open]:bg-white/10"
      : overlayTone === "light"
        ? "inline-flex h-10 items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 text-sm text-zinc-800 outline-none transition hover:bg-zinc-100 data-[state=open]:bg-zinc-100"
        : "inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-foreground outline-none transition hover:bg-foreground/5 data-[state=open]:bg-foreground/5";

  if (!user) {
    if (compact) {
      return (
        <NextLink
          href={loginHref}
          className={compactTriggerClass}
          aria-label={t("login")}
        >
          <UserIcon className="h-4 w-4 shrink-0" />
          <span className="sr-only">{t("login")}</span>
        </NextLink>
      );
    }

    return (
      <NextLink
        href={loginHref}
        className={`${loginClass} inline-flex items-center gap-1.5`}
      >
        <UserIcon className="h-4 w-4 shrink-0" />
        {t("login")}
      </NextLink>
    );
  }

  const displayName = user.name?.trim() || user.email || t("account");

  function toggleMenu() {
    setOpen((current) => !current);
  }

  function onLogout() {
    startTransition(async () => {
      await signOutAction();
    });
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <div
        className={`inline-flex shrink-0 items-stretch overflow-hidden rounded-md ${
          compact ? "max-w-none" : "max-w-[18rem]"
        }`}
      >
        {compact ? (
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={compactTriggerClass}
              aria-label={t("accountMenu")}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0"
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
              <span className="sr-only">{t("account")}</span>
            </button>
          </DropdownMenu.Trigger>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMenu}
              className="min-w-0 flex-1 px-2.5 py-1.5 text-left outline-none transition hover:bg-foreground/5 focus-visible:bg-foreground/5"
              aria-expanded={open}
              aria-haspopup="menu"
            >
              <span className="block truncate text-sm font-medium leading-tight text-foreground">
                {displayName}
              </span>
              {user.email && user.name?.trim() ? (
                <span className="block truncate text-xs leading-tight text-muted">
                  {user.email}
                </span>
              ) : null}
            </button>

            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex items-center justify-center px-2 text-muted outline-none transition hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5 data-[state=open]:bg-foreground/5"
                aria-label={t("accountMenu")}
              >
                <svg
                  viewBox="0 0 16 16"
                  className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
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
          </>
        )}
      </div>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[12rem] rounded-md border border-border bg-surface p-1 shadow-md outline-none"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">
              {displayName}
            </p>
            {user.email ? (
              <p className="truncate text-xs text-muted">{user.email}</p>
            ) : null}
          </div>

          {user.isAdmin ? (
            <DropdownMenu.Item asChild>
              <NextLink
                href="/admin"
                className="mt-1 flex cursor-pointer select-none items-center gap-2.5 rounded px-3 py-2 text-sm text-foreground outline-none transition hover:bg-foreground/5 data-[highlighted]:bg-foreground/5"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4 shrink-0 text-muted"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="5" height="5" rx="0.75" />
                  <rect x="9" y="2" width="5" height="5" rx="0.75" />
                  <rect x="2" y="9" width="5" height="5" rx="0.75" />
                  <rect x="9" y="9" width="5" height="5" rx="0.75" />
                </svg>
                {t("dashboard")}
              </NextLink>
            </DropdownMenu.Item>
          ) : null}

          <DropdownMenu.Item asChild>
            <NextLink
              href={user.callsign ? `/${user.callsign}` : `/${locale}/account`}
              className="flex cursor-pointer select-none items-center gap-2.5 rounded px-3 py-2 text-sm text-foreground outline-none transition hover:bg-foreground/5 data-[highlighted]:bg-foreground/5"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0 text-muted"
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
              {t("myProfile")}
            </NextLink>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <NextLink
              href="/qso"
              className="flex cursor-pointer select-none items-center gap-2.5 rounded px-3 py-2 text-sm text-foreground outline-none transition hover:bg-foreground/5 data-[highlighted]:bg-foreground/5"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0 text-muted"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.5 2.75h5.25L13 6.25v6.5A1.25 1.25 0 0 1 11.75 14H4.5A1.25 1.25 0 0 1 3.25 12.75V4A1.25 1.25 0 0 1 4.5 2.75Z" />
                <path d="M9.5 2.75V6H13" />
                <path d="M5.5 8.25h5" />
                <path d="M5.5 10.75h5" />
              </svg>
              {t("qsoMap")}
            </NextLink>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <NextLink
              href="/qth"
              className="flex cursor-pointer select-none items-center gap-2.5 rounded px-3 py-2 text-sm text-foreground outline-none transition hover:bg-foreground/5 data-[highlighted]:bg-foreground/5"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0 text-muted"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10Z" />
                <circle cx="12" cy="11" r="2.5" />
              </svg>
              {t("qth")}
            </NextLink>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              onLogout();
            }}
            className="flex cursor-pointer select-none items-center gap-2.5 rounded px-3 py-2 text-sm text-foreground outline-none transition hover:bg-foreground/5 data-[highlighted]:bg-foreground/5 data-[disabled]:opacity-50"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4 shrink-0 text-muted"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 3H3.75A1.75 1.75 0 0 0 2 4.75v6.5C2 12.216 2.784 13 3.75 13H6" />
              <path d="M7 8h7" />
              <path d="M11.5 5.5 14 8l-2.5 2.5" />
            </svg>
            {pending ? "…" : t("logout")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
