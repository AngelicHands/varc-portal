"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { HamTabId } from "@/lib/ham-reserved";

type TabDef = {
  id: HamTabId;
  ownerOnly: boolean;
};

const TABS: TabDef[] = [
  { id: "profile", ownerOnly: true },
  { id: "logbook", ownerOnly: false },
  { id: "documents", ownerOnly: true },
  { id: "qsl", ownerOnly: true },
  { id: "privacy", ownerOnly: true },
  { id: "security", ownerOnly: true },
];

function tabHref(basePath: string, id: HamTabId, firstVisible: HamTabId): string {
  if (id === firstVisible) return basePath;
  const join = basePath.includes("?") ? "&" : "?";
  return `${basePath}${join}tab=${id}`;
}

export function HamProfileTabs({
  /** Public profile path (`/XV1ABC`) or account path (`/vi/account`) when callsign is unset. */
  basePath,
  callsign,
  active,
  isOwner,
  canViewProfile = true,
  canViewLogbook = true,
  logbook,
  profile,
  documents,
  qsl,
  privacy,
  security,
}: {
  basePath?: string;
  callsign?: string;
  active: HamTabId;
  isOwner: boolean;
  canViewProfile?: boolean;
  canViewLogbook?: boolean;
  logbook: ReactNode;
  profile?: ReactNode;
  documents?: ReactNode;
  qsl?: ReactNode;
  privacy?: ReactNode;
  security?: ReactNode;
}) {
  const t = useTranslations("ham");
  const router = useRouter();
  const resolvedBasePath =
    basePath?.trim() || (callsign?.trim() ? `/${callsign.trim()}` : "/account");
  const [displayTab, setDisplayTab] = useState(active);
  const [syncedActive, setSyncedActive] = useState(active);
  const [mountedTabs, setMountedTabs] = useState<HamTabId[]>(() => [active]);
  const [, startTransition] = useTransition();

  if (active !== syncedActive) {
    setSyncedActive(active);
    setDisplayTab(active);
    if (!mountedTabs.includes(active)) {
      setMountedTabs([...mountedTabs, active]);
    }
  }

  const visible = TABS.filter((tab) => {
    if (tab.id === "profile" && !isOwner) return canViewProfile;
    if (tab.id === "logbook" && !isOwner) return canViewLogbook;
    return !tab.ownerOnly || isOwner;
  });
  const firstVisible = visible[0]?.id ?? "profile";
  const labels: Record<HamTabId, string> = {
    profile: t("tabProfile"),
    logbook: t("tabLogbook"),
    documents: t("tabDocuments"),
    qsl: t("tabQsl"),
    privacy: t("tabPrivacy"),
    security: t("tabSecurity"),
  };

  function goToTab(tabId: HamTabId) {
    if (tabId === displayTab) return;
    const href = tabHref(resolvedBasePath, tabId, firstVisible);
    setDisplayTab(tabId);
    setMountedTabs((prev) =>
      prev.includes(tabId) ? prev : [...prev, tabId],
    );
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  const panels: { id: HamTabId; node: ReactNode }[] = [
    { id: "profile", node: profile },
    { id: "logbook", node: logbook },
    { id: "documents", node: documents },
    { id: "qsl", node: qsl },
    { id: "privacy", node: privacy },
    { id: "security", node: security },
  ];

  return (
    <div className="mt-12">
      <div
        role="tablist"
        aria-label={t("tabs")}
        className="flex flex-wrap gap-6 border-b border-border"
      >
        {visible.map((tab) => {
          const selected = tab.id === displayTab;
          return (
            <NextLink
              key={tab.id}
              role="tab"
              aria-selected={selected}
              id={`ham-tab-${tab.id}`}
              aria-controls={`ham-panel-${tab.id}`}
              href={tabHref(resolvedBasePath, tab.id, firstVisible)}
              onClick={(event) => {
                event.preventDefault();
                goToTab(tab.id);
              }}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
                selected
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {labels[tab.id]}
            </NextLink>
          );
        })}
      </div>
      {panels.map(({ id, node }) => {
        if (node == null || !mountedTabs.includes(id)) return null;
        const selected = displayTab === id;
        return (
          <div
            key={id}
            role="tabpanel"
            id={`ham-panel-${id}`}
            aria-labelledby={`ham-tab-${id}`}
            hidden={!selected}
            className={selected ? "pt-8" : "hidden pt-8"}
          >
            {node}
          </div>
        );
      })}
    </div>
  );
}
