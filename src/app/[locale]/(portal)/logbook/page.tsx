import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAccountProfile } from "@/lib/account";
import { hamPublicPath } from "@/lib/ham-reserved";
import { requirePortalSession } from "@/lib/portal-access";
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
  const profile = await getAccountProfile(session.user.id, session.user.email);
  const callsign = profile?.callsign?.trim() ?? "";

  if (!callsign) {
    redirect(`/${locale}/account?setup=callsign`);
  }

  redirect(`${hamPublicPath(callsign)}?tab=logbook`);
}
