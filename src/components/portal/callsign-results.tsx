import { Link } from "@/i18n/navigation";
import type { CallsignListItem } from "@/lib/callsigns";
import { formatDateUtc7 } from "@/lib/datetime-local";
import type { AppLocale } from "@/i18n/routing";

type Labels = {
  issued: string;
  expires: string;
  events: string;
  expired: string;
  valid: string;
  unknown: string;
};

function statusLabel(
  status: CallsignListItem["status"],
  labels: Labels,
): string {
  if (status === "valid") return labels.valid;
  if (status === "unknown") return labels.unknown;
  return labels.expired;
}

export function CallsignResultList({
  items,
  locale,
  labels,
}: {
  items: CallsignListItem[];
  locale: AppLocale;
  labels: Labels;
}) {
  const dateLocale = locale === "vi" ? "vi-VN" : "en-GB";

  return (
    <ul className="divide-y divide-border/80 border-y border-border/80">
      {items.map((item) => {
        const issued = formatDateUtc7(item.issuedAt, dateLocale);
        const expires = formatDateUtc7(item.expiresAt, dateLocale);
        return (
          <li key={item.sign}>
            <Link
              href={{
                pathname: "/callsigns/[sign]",
                params: { sign: item.sign },
              }}
              className="group grid grid-cols-1 gap-2 py-5 transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:grid-cols-[8.5rem_1fr_auto] md:items-baseline md:gap-8"
            >
              <span className="font-display text-2xl tracking-wide text-foreground group-hover:text-accent">
                {item.sign}
              </span>
              <span className="min-w-0">
                <span className="block text-foreground">
                  {item.operatorName || "—"}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {item.permitRaw ? `${item.permitRaw} · ` : ""}
                  {issued
                    ? `${labels.issued} ${issued}`
                    : null}
                  {issued && expires ? " · " : null}
                  {expires ? `${labels.expires} ${expires}` : null}
                  {!issued && !expires ? labels.unknown : null}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tracking-wide text-muted uppercase md:justify-end">
                <span>{statusLabel(item.status, labels)}</span>
                {item.eventCount > 1 ? (
                  <span>
                    {item.eventCount} {labels.events}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CallsignPagination({
  locale,
  query,
  page,
  totalPages,
  previousLabel,
  nextLabel,
}: {
  locale: string;
  query: string;
  page: number;
  totalPages: number;
  previousLabel: string;
  nextLabel: string;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return `/${locale}/callsigns${qs ? `?${qs}` : ""}`;
  };

  return (
    <nav
      className="mt-10 flex items-center justify-between text-sm"
      aria-label="Pagination"
    >
      {page > 1 ? (
        <a href={hrefFor(page - 1)} className="text-accent hover:underline">
          {previousLabel}
        </a>
      ) : (
        <span className="text-muted/50">{previousLabel}</span>
      )}
      <span className="text-muted">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <a href={hrefFor(page + 1)} className="text-accent hover:underline">
          {nextLabel}
        </a>
      ) : (
        <span className="text-muted/50">{nextLabel}</span>
      )}
    </nav>
  );
}
