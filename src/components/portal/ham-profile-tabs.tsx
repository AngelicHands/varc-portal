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
];

function tabHref(callsign: string, id: HamTabId, isOwner: boolean): string {
  const firstVisible = isOwner ? "profile" : "logbook";
  if (id === firstVisible) return `/${callsign}`;
  return `/${callsign}?tab=${id}`;
}

export function HamProfileTabs({
  callsign,
  active,
  isOwner,
  logbook,
  profile,
  documents,
  qsl,
}: {
  callsign: string;
  active: HamTabId;
  isOwner: boolean;
  logbook: ReactNode;
  profile?: ReactNode;
  documents?: ReactNode;
  qsl?: ReactNode;
}) {
  const t = useTranslations("ham");
  const visible = TABS.filter((tab) => !tab.ownerOnly || isOwner);
  const labels: Record<HamTabId, string> = {
    profile: t("tabProfile"),
    logbook: t("tabLogbook"),
    documents: t("tabDocuments"),
    qsl: t("tabQsl"),
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
              href={tabHref(callsign, tab.id, isOwner)}
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
        {active === "profile" ? profile : null}
        {active === "logbook" ? logbook : null}
        {active === "documents" ? documents : null}
        {active === "qsl" ? qsl : null}
      </div>
    </div>
  );
}
