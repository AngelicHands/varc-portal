"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getVisibleAdminFunctions,
  searchAdminFunctions,
  type AdminFunction,
  type AdminNavVisibility,
} from "@/lib/admin-nav";

type Props = AdminNavVisibility & {
  compact?: boolean;
  className?: string;
};

function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function navigateToFunction(
  router: ReturnType<typeof useRouter>,
  item: AdminFunction,
) {
  if (item.external) {
    window.open(item.href, "_blank", "noopener,noreferrer");
    return;
  }
  router.push(item.href);
}

export function AdminFunctionSearch({
  compact = false,
  className = "",
  showEditorial,
  showImportExport,
  showPages,
  showSite,
  showUsers,
  showRoles,
}: Props) {
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const allFunctions = useMemo(
    () =>
      getVisibleAdminFunctions({
        showEditorial,
        showImportExport,
        showPages,
        showSite,
        showUsers,
        showRoles,
      }),
    [
      showEditorial,
      showImportExport,
      showPages,
      showSite,
      showUsers,
      showRoles,
    ],
  );

  const results = useMemo(
    () => searchAdminFunctions(allFunctions, query),
    [allFunctions, query],
  );

  const showDropdown = open && results.length > 0;
  const safeActiveIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setMobileExpanded(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function selectItem(item: AdminFunction) {
    navigateToFunction(router, item);
    setQuery("");
    setOpen(false);
    setMobileExpanded(false);
    inputRef.current?.blur();
  }

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    setActiveIndex(0);
    setOpen(true);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const item = results[safeActiveIndex];
      if (item) selectItem(item);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setMobileExpanded(false);
      inputRef.current?.blur();
    }
  }

  const inputClassName =
    "w-full rounded-md border border-gray-200 bg-gray-50 py-2 pr-3 pl-9 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-200";

  const dropdown = showDropdown ? (
    <ul
      id={listboxId}
      role="listbox"
      className="absolute top-[calc(100%+0.375rem)] z-50 max-h-80 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
    >
      {results.map((item, index) => {
        const active = index === safeActiveIndex;
        return (
          <li key={item.id} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={active}
              className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition ${
                active ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-50"
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectItem(item)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500">
                  {item.description}
                </span>
                <span className="mt-1 block truncate text-[10px] font-medium tracking-wide text-gray-400 uppercase">
                  {item.group}
                </span>
              </span>
              {item.external ? (
                <span className="shrink-0 text-[10px] font-medium tracking-wide text-gray-400 uppercase">
                  External
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  if (compact) {
    if (!mobileExpanded) {
      return (
        <button
          type="button"
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 ${className}`}
          aria-label="Search admin functions"
          onClick={() => {
            setMobileExpanded(true);
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <SearchIcon />
        </button>
      );
    }

    return (
      <div ref={rootRef} className={`relative min-w-0 flex-1 ${className}`}>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder="Search admin…"
          aria-label="Search admin functions"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
          className={inputClassName}
        />
        {dropdown}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => updateQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        placeholder="Search admin functions…"
        aria-label="Search admin functions"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-autocomplete="list"
        role="combobox"
        autoComplete="off"
        className={inputClassName}
      />
      {dropdown}
    </div>
  );
}
