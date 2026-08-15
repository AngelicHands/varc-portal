import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CallsignResultList, CallsignPagination } from "@/components/portal/callsign-results";
import { CallsignSearchForm } from "@/components/portal/callsign-search-form";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { Reveal } from "@/components/portal/reveal";
import { getCallsignStats, searchCallsigns } from "@/lib/callsigns";
import { getPublicSiteBranding } from "@/lib/cms";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "callsigns" });
  const branding = await getPublicSiteBranding(locale);
  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: `${t("title")} - ${branding.siteName}`,
      description: t("description"),
    },
  };
}

export default async function CallsignsPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const { q, page } = await searchParams;
  const t = await getTranslations("callsigns");
  const [result, stats] = await Promise.all([
    searchCallsigns(q, page),
    getCallsignStats(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 md:px-6 md:py-20">
      <SetLocaleAlternates vi="/callsigns" en="/callsigns" />

      <Reveal>
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.7fr)] md:items-end">
          <div>
            <p className="text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
              {t("eyebrow")}
            </p>
            <h1 className="mt-3 font-display text-4xl leading-[1.1] text-foreground md:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-5 max-w-xl text-muted">{t("lede")}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:text-right">
            <div>
              <dt className="text-muted">{t("statCallsigns")}</dt>
              <dd className="font-display text-2xl text-foreground">
                {stats.callsigns}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t("statOperators")}</dt>
              <dd className="font-display text-2xl text-foreground">
                {stats.operators}
              </dd>
            </div>
          </dl>
        </div>
      </Reveal>

      <CallsignSearchForm
        locale={locale}
        query={result.query}
        placeholder={t("placeholder")}
        submitLabel={t("search")}
        clearLabel={t("clear")}
      />

      <p className="mt-8 border-l-2 border-accent/40 pl-4 text-sm text-muted">
        {t("archiveNote")}
      </p>

      {result.query ? (
        <div className="mt-12">
          {result.total === 0 ? (
            <p className="py-10 text-muted">{t("emptySearch")}</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">
                {t("resultCount", { count: result.total })}
              </p>
              <CallsignResultList
                items={result.items}
                locale={locale}
                labels={{
                  issued: t("issued"),
                  expires: t("expires"),
                  events: t("events"),
                  expired: t("statusExpired"),
                  valid: t("statusValid"),
                  unknown: t("statusUnknown"),
                }}
              />
              <CallsignPagination
                locale={locale}
                query={result.query}
                page={result.page}
                totalPages={result.totalPages}
                previousLabel={t("previous")}
                nextLabel={t("next")}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
