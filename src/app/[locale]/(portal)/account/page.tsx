import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountProfileForm } from "@/components/portal/account-profile-form";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { getAccountProfile } from "@/lib/account";
import { requirePortalSession } from "@/lib/portal-access";
import { listUserDocuments } from "@/lib/user-documents";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ setup?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title") };
}

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const { setup } = await searchParams;
  const session = await requirePortalSession(locale);
  const t = await getTranslations("account");
  const [profile, documents] = await Promise.all([
    getAccountProfile(session.user.id, session.user.email),
    listUserDocuments(session.user.id),
  ]);

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  const callsign = profile.callsign.trim();
  if (callsign) {
    redirect({
      href: {
        pathname: "/[callsign]",
        params: { callsign },
        query: { tab: "profile" },
      },
      locale,
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
      <SetLocaleAlternates vi="/account" en="/account" />
      <h1 className="font-display text-4xl text-foreground">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-muted">{t("lede")}</p>

      {setup === "callsign" ? (
        <p className="mt-6 rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-foreground">
          {t("callsignRequired")}
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium text-foreground">{t("profile")}</h2>
        <AccountProfileForm
          initial={{
            name: profile.name,
            email: profile.email,
            callsign: profile.callsign,
            callsignVerified: profile.callsignVerified,
            callsignVerificationStatus: profile.callsignVerificationStatus,
            birthday: profile.birthday,
            gender: profile.gender,
            homeGrid: profile.homeGrid,
            homeLat: profile.homeLat,
            homeLng: profile.homeLng,
          }}
          initialDocuments={documents}
        />
      </section>
    </div>
  );
}
