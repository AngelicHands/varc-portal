"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
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
  { id: "security", ownerOnly: true },
];

function tabHref(callsign: string, id: HamTabId, firstVisible: HamTabId): string {
  if (id === firstVisible) return `/${callsign}`;
  return `/${callsign}?tab=${id}`;
}

export function HamProfileTabs({
  callsign,
  active,
  isOwner,
  canViewProfile = true,
  canViewLogbook = true,
  logbook,
  profile,
  documents,
  qsl,
  security,
}: {
  callsign: string;
  active: HamTabId;
  isOwner: boolean;
  canViewProfile?: boolean;
  canViewLogbook?: boolean;
  logbook: ReactNode;
  profile?: ReactNode;
  documents?: ReactNode;
  qsl?: ReactNode;
  security?: ReactNode;
}) {
  const t = useTranslations("ham");
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
    security: t("tabSecurity"),
  };

  return (
    <div className="mt-12">
      <div
        role="tablist"
        aria-label={t("tabs")}
        className="flex flex-wrap gap-6 border-b border-border"
      >
        {visible.map((tab) => {
          const selected = tab.id === active;
          return (
            <NextLink
              key={tab.id}
              role="tab"
              aria-selected={selected}
              id={`ham-tab-${tab.id}`}
              aria-controls={`ham-panel-${tab.id}`}
              href={tabHref(callsign, tab.id, firstVisible)}
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
      <div
        role="tabpanel"
        id={`ham-panel-${active}`}
        aria-labelledby={`ham-tab-${active}`}
        className="pt-8"
      >
        {active === "profile"
          ? profile
          : active === "logbook"
            ? logbook
            : active === "documents"
              ? documents
              : active === "qsl"
                ? qsl
                : active === "security"
                  ? security
                  : null}
      </div>
    </div>
  );
}
