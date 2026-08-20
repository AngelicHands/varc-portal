import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { QsoLogbook } from "@/components/portal/qso-logbook";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { Link, redirect } from "@/i18n/navigation";
import { getAccountProfile } from "@/lib/account";
import { requirePortalSession } from "@/lib/portal-access";
import { listUserQsos } from "@/lib/qso";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "logbook" });
  return { title: t("title") };
}

export default async function LogbookPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const session = await requirePortalSession(locale);
  const t = await getTranslations("logbook");
  const profile = await getAccountProfile(session.user.id, session.user.email);

  if (!profile?.callsign?.trim()) {
    redirect({
      href: { pathname: "/account", query: { setup: "callsign" } },
      locale,
    });
  }

  const stationCallsign = profile!.callsign;
  const qsos = await listUserQsos(session.user.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
      <SetLocaleAlternates vi="/logbook" en="/logbook" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-foreground">{t("title")}</h1>
          <p className="mt-3 max-w-2xl text-muted">{t("lede")}</p>
        </div>
        <Link href="/account" className="text-sm text-accent hover:underline">
          {t("editProfile")}
        </Link>
      </div>

      <div className="mt-10">
        <QsoLogbook initialQsos={qsos} stationCallsign={stationCallsign} />
      </div>
    </div>
  );
}
