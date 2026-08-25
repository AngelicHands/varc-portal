"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

const STORAGE_KEY = "varc-article-section-aside-expanded-v2";
const ASIDE_EVENT = "varc-article-section-aside";
const PANEL_TRANSITION = "duration-300 ease-in-out motion-reduce:transition-none";

/** Outer shell widths (animated). */
export const ARTICLE_ASIDE_WIDTH_EXPANDED = "w-72";
export const ARTICLE_ASIDE_WIDTH_COLLAPSED = "w-[4.5rem]";
/** Inner content always stays this wide; outer overflow clips it. */
export const ARTICLE_ASIDE_INNER_WIDTH = "w-72 shrink-0";
export const ARTICLE_ASIDE_PAD_EXPANDED = "lg:pr-80";
export const ARTICLE_ASIDE_PAD_COLLAPSED = "lg:pr-24";

export type ArticleSideSectionId = "properties" | "images" | "seo" | "datetime";

type SectionItem = {
  id: ArticleSideSectionId;
  label: string;
  icon: ReactNode;
};

function Icon({
  children,
  className = "h-5 w-5 shrink-0",
}: {
  children: ReactNode;
  className?: string;
}) {
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
      {children}
    </svg>
  );
}

export const ARTICLE_SIDE_SECTIONS: SectionItem[] = [
  {
    id: "properties",
    label: "Properties",
    icon: (
      <Icon>
        <path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      </Icon>
    ),
  },
  {
    id: "images",
    label: "Images",
    icon: (
      <Icon>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m21 16-4.5-4.5L8 20" />
      </Icon>
    ),
  },
  {
    id: "seo",
    label: "SEO",
    icon: (
      <Icon>
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-3.5-3.5" />
      </Icon>
    ),
  },
  {
    id: "datetime",
    label: "Date Time",
    icon: (
      <Icon>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 11h18" />
      </Icon>
    ),
  },
];

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ASIDE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ASIDE_EVENT, onStoreChange);
  };
}

function isDesktopViewport() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function readExpandedPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return true;
    return stored !== "0";
  } catch {
    return true;
  }
}

function getSnapshot() {
  if (!isDesktopViewport()) return true;
  return readExpandedPreference();
}

function getServerSnapshot() {
  return true;
}

function setExpandedPreference(next: boolean) {
  try {
    if (isDesktopViewport()) {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(ASIDE_EVENT));
}

/** Expand or collapse the article details rail (desktop). */
export function setArticleSectionAsideExpanded(next: boolean) {
  setExpandedPreference(next);
}

export function useArticleSectionAsideExpanded() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function SectionChevron({ open }: { open: boolean }) {
  return (
    <Icon
      className={`h-4 w-4 shrink-0 opacity-70 transition-transform ${PANEL_TRANSITION} ${
        open ? "rotate-0" : "-rotate-90"
      }`}
    >
      <path d="m6 10 6 6 6-6" />
    </Icon>
  );
}

export function AccordionPanel({
  open,
  fill = false,
  panelClassName,
  children,
}: {
  open: boolean;
  /** When true and open, grow to fill a flex parent so tall content scrolls. */
  fill?: boolean;
  panelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`admin-accordion-panel${open && fill ? " min-h-0 flex-1" : ""}`}
      data-open={open ? "true" : "false"}
      data-fill={fill ? "true" : "false"}
    >
      <div className={`admin-accordion-panel-inner ${panelClassName ?? ""}`}>
        {children}
      </div>
    </div>
  );
}

export function CollapsibleSectionHeader({
  open,
  onToggle,
  title,
  subtitle,
  icon,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors ${PANEL_TRANSITION} ${
        open
          ? "bg-gray-900 text-white"
          : "bg-white text-gray-800 hover:bg-gray-50"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && !open ? (
          <span className="mt-0.5 block truncate text-xs opacity-70">{subtitle}</span>
        ) : null}
      </span>
      <SectionChevron open={open} />
    </button>
  );
}

type Props = {
  openSection: ArticleSideSectionId | null;
  onOpenSectionChange: (section: ArticleSideSectionId | null) => void;
  panels: Record<ArticleSideSectionId, ReactNode>;
};

/**
 * Icon sits in a fixed column matching the collapsed rail width so that when
 * the outer shell clips to w-[4.5rem], only the icons remain visible.
 */
function AsideSectionHeader({
  item,
  open,
  onToggle,
}: {
  item: (typeof ARTICLE_SIDE_SECTIONS)[number];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={item.label}
      className={`flex w-full cursor-pointer items-stretch text-left text-sm transition-colors ${PANEL_TRANSITION} ${
        open
          ? "bg-gray-900 text-white"
          : "bg-white text-gray-800 hover:bg-gray-50"
      }`}
    >
      <span className="flex w-[4.5rem] shrink-0 items-center justify-center py-3.5">
        {item.icon}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pr-4">
        <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
        <SectionChevron open={open} />
      </span>
    </button>
  );
}

function ArticleAsideDesktopStack({
  stackRef,
  openSection,
  railExpanded,
  onToggleSection,
  panels,
}: {
  stackRef: RefObject<HTMLDivElement | null>;
  openSection: ArticleSideSectionId | null;
  railExpanded: boolean;
  onToggleSection: (id: ArticleSideSectionId) => void;
  panels: Record<ArticleSideSectionId, ReactNode>;
}) {
  return (
    <div
      ref={stackRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain"
    >
      {ARTICLE_SIDE_SECTIONS.map((item) => {
        const open = openSection === item.id;
        return (
          <div
            key={`desktop-${item.id}`}
            id={`article-aside-section-${item.id}`}
            className={`flex min-h-0 flex-col border-b border-gray-200 last:border-b-0 ${
              open && railExpanded ? "min-h-0 flex-1" : "shrink-0"
            }`}
          >
            <AsideSectionHeader
              item={item}
              open={open}
              onToggle={() => onToggleSection(item.id)}
            />
            <AccordionPanel
              open={open && railExpanded}
              fill
              panelClassName="overscroll-contain bg-gray-50/80 px-4 py-4"
            >
              <div className="w-full min-w-0">{panels[item.id]}</div>
            </AccordionPanel>
          </div>
        );
      })}
    </div>
  );
}

function ArticleAsideMobileStack({
  stackRef,
  openSection,
  onToggleSection,
  panels,
}: {
  stackRef: RefObject<HTMLDivElement | null>;
  openSection: ArticleSideSectionId | null;
  onToggleSection: (id: ArticleSideSectionId) => void;
  panels: Record<ArticleSideSectionId, ReactNode>;
}) {
  return (
    <div
      ref={stackRef}
      className="flex max-h-[min(80vh,40rem)] flex-col overflow-y-auto overscroll-contain"
    >
      {ARTICLE_SIDE_SECTIONS.map((item) => {
        const open = openSection === item.id;
        return (
          <div
            key={`mobile-${item.id}`}
            id={`article-aside-section-${item.id}`}
            className="border-b border-gray-200 last:border-b-0"
          >
            <AsideSectionHeader
              item={item}
              open={open}
              onToggle={() => onToggleSection(item.id)}
            />
            <AccordionPanel
              open={open}
              panelClassName="max-h-[min(70vh,28rem)] bg-gray-50/80 px-4 py-4"
            >
              <div className="mx-auto w-full max-w-full min-w-0">
                {panels[item.id]}
              </div>
            </AccordionPanel>
          </div>
        );
      })}
    </div>
  );
}

export function ArticleSectionAside({
  openSection,
  onOpenSectionChange,
  panels,
}: Props) {
  const railExpanded = useArticleSectionAsideExpanded();
  const desktopStackRef = useRef<HTMLDivElement>(null);
  const mobileStackRef = useRef<HTMLDivElement>(null);
  const desktopDefaultAppliedRef = useRef(false);

  function toggleRail() {
    setExpandedPreference(!railExpanded);
  }

  function openSectionOnly(id: ArticleSideSectionId) {
    onOpenSectionChange(openSection === id ? null : id);
  }

  function toggleMobileStack(id: ArticleSideSectionId) {
    openSectionOnly(id);
  }

  function toggleDesktopStack(id: ArticleSideSectionId) {
    if (!railExpanded) {
      setExpandedPreference(true);
      onOpenSectionChange(id);
      return;
    }
    openSectionOnly(id);
  }

  useEffect(() => {
    if (desktopDefaultAppliedRef.current) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    desktopDefaultAppliedRef.current = true;

    try {
      if (window.localStorage.getItem(STORAGE_KEY) === null) {
        setExpandedPreference(true);
      }
    } catch {
      // ignore
    }

    onOpenSectionChange("properties");
  }, [onOpenSectionChange]);

  useEffect(() => {
    if (!openSection || !railExpanded) return;

    const sectionEl = document.getElementById(
      `article-aside-section-${openSection}`,
    );
    if (!sectionEl) return;

    const scrollRoot =
      window.matchMedia("(min-width: 1024px)").matches
        ? desktopStackRef.current
        : mobileStackRef.current;

    if (scrollRoot && scrollRoot.scrollHeight > scrollRoot.clientHeight) {
      const rootTop = scrollRoot.getBoundingClientRect().top;
      const sectionTop = sectionEl.getBoundingClientRect().top;
      scrollRoot.scrollTo({
        top: scrollRoot.scrollTop + (sectionTop - rootTop),
        behavior: "smooth",
      });
      return;
    }

    sectionEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [openSection, railExpanded]);

  return (
    <>
      {/* Mobile: accordion under main content */}
      <div className="mt-6 min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white lg:hidden">
        <ArticleAsideMobileStack
          stackRef={mobileStackRef}
          openSection={openSection}
          onToggleSection={toggleMobileStack}
          panels={panels}
        />
      </div>

      {/*
        Desktop: outer shell animates width (no overflow clip here so the
        toggle can overhang page content). An inner clip layer reveals the
        fixed w-72 stack. z-40 sits above page chrome (z-20) but under
        modals (z-60+ / z-70 / z-100).
      */}
      <div
        className={`fixed top-14 right-0 bottom-0 z-40 hidden transition-[width] ${PANEL_TRANSITION} lg:block ${
          railExpanded
            ? ARTICLE_ASIDE_WIDTH_EXPANDED
            : ARTICLE_ASIDE_WIDTH_COLLAPSED
        }`}
      >
        <button
          type="button"
          onClick={toggleRail}
          className={`absolute top-1/2 left-0 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 ${PANEL_TRANSITION}`}
          aria-label={railExpanded ? "Collapse details" : "Expand details"}
          title={railExpanded ? "Collapse" : "Expand"}
        >
          <Icon
            className={`h-4 w-4 transition-transform ${PANEL_TRANSITION} ${
              railExpanded ? "rotate-0" : "rotate-180"
            }`}
          >
            <path d="M9 6 15 12 9 18" />
          </Icon>
        </button>

        <div className="h-full overflow-hidden bg-white">
          <aside
            className={`flex h-full flex-col ${ARTICLE_ASIDE_INNER_WIDTH}`}
          >
            <ArticleAsideDesktopStack
              stackRef={desktopStackRef}
              openSection={openSection}
              railExpanded={railExpanded}
              onToggleSection={toggleDesktopStack}
              panels={panels}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
