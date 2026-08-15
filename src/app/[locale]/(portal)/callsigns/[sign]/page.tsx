import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { getCallsignDetail } from "@/lib/callsigns";
import { getPublicSiteBranding } from "@/lib/cms";
import { formatDateUtc7 } from "@/lib/datetime-local";
import { callsignHref } from "@/lib/locale-hrefs";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; sign: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam, sign } = await params;
  const locale = localeParam as AppLocale;
  const detail = await getCallsignDetail(sign);
  if (!detail) return { title: "Not found" };
  const t = await getTranslations({ locale, namespace: "callsigns" });
  const branding = await getPublicSiteBranding(locale);
  const description = t("detailDescription", {
    sign: detail.sign,
    name: detail.operatorName || t("statusUnknown"),
  });
  return {
    title: detail.sign,
    description,
    openGraph: {
      title: `${detail.sign} - ${branding.siteName}`,
      description,
    },
  };
}

export default async function CallsignDetailPage({ params }: Props) {
  const { locale: localeParam, sign } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const detail = await getCallsignDetail(sign);
  if (!detail) notFound();

  const t = await getTranslations("callsigns");
  const dateLocale = locale === "vi" ? "vi-VN" : "en-GB";
  const statusLabel =
    detail.latestStatus === "valid"
      ? t("statusValid")
      : detail.latestStatus === "unknown"
        ? t("statusUnknown")
        : t("statusExpired");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-20">
      <SetLocaleAlternates
        vi={callsignHref(detail.sign)}
        en={callsignHref(detail.sign)}
      />

      <Link
        href="/callsigns"
        className="text-sm text-accent hover:underline"
      >
        {t("back")}
      </Link>

      <p className="mt-8 text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
        {t("eyebrow")}
      </p>
      <h1 className="mt-3 font-display text-5xl tracking-wide text-foreground md:text-6xl">
        {detail.sign}
      </h1>
      <p className="mt-4 text-lg text-foreground">{detail.operatorName || "—"}</p>
      <p className="mt-2 text-sm text-muted">
        {statusLabel}
        {detail.prefixFamily !== "other"
          ? ` · ${detail.prefixFamily}${detail.areaDigit ?? ""}`
          : null}
        {detail.eventCount > 1
          ? ` · ${detail.eventCount} ${t("events")}`
          : null}
      </p>

      <p className="mt-8 border-l-2 border-accent/40 pl-4 text-sm text-muted">
        {t("archiveNote")}
      </p>

      <h2 className="mt-14 font-display text-2xl text-foreground">
        {t("history")}
      </h2>
      <ol className="mt-6 divide-y divide-border/80 border-y border-border/80">
        {detail.licenses.map((row) => {
          const issued = formatDateUtc7(row.issuedAt, dateLocale);
          const expires = formatDateUtc7(row.expiresAt, dateLocale);
          const typeLabel =
            row.permitType === "GP"
              ? t("typeNew")
              : row.permitType === "GH"
                ? t("typeRenewal")
                : row.permitType === "missing"
                  ? t("typeMissing")
                  : row.permitType;
          return (
            <li key={row.stt} className="py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-display text-xl text-foreground">
                  {issued || t("statusUnknown")}
                </p>
                <p className="text-xs tracking-wide text-muted uppercase">
                  {typeLabel}
                </p>
              </div>
              <p className="mt-2 text-sm text-foreground">{row.operatorName}</p>
              <p className="mt-1 text-sm text-muted">
                {row.permitRaw ? `${row.permitRaw} · ` : ""}
                {expires ? `${t("expires")} ${expires}` : t("statusUnknown")}
              </p>
              {row.callsigns.length > 1 ? (
                <p className="mt-2 text-sm text-muted">
                  {t("alsoAssigned")}: {row.callsigns.join(", ")}
                </p>
              ) : null}
              {row.notes ? (
                <p className="mt-2 text-sm text-muted">{row.notes}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
