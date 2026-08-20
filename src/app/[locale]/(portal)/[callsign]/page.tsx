import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { AccountProfileForm } from "@/components/portal/account-profile-form";
import { HamProfileTabs } from "@/components/portal/ham-profile-tabs";
import { QsoLogbook } from "@/components/portal/qso-logbook";
import { UserDocumentsPanel } from "@/components/portal/user-documents-panel";
import { getAccountProfile } from "@/lib/account";
import { findPublicHamByCallsign, hamPublicUrl } from "@/lib/ham-profile";
import { parseHamPathParam, parseHamTab } from "@/lib/ham-reserved";
import { getPublicSiteBranding } from "@/lib/cms";
import { getPublicBaseUrl } from "@/lib/public-url";
import { listUserQsos } from "@/lib/qso";
import { listUserDocuments } from "@/lib/user-documents";
import { callsignHref, hamHref } from "@/lib/locale-hrefs";
import { formatBirthdayDmy } from "@/lib/validations/qso";
import { canManageUsers } from "@/lib/roles";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ locale: string; callsign: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam, callsign: raw } = await params;
  const locale = localeParam as AppLocale;
  const sign = parseHamPathParam(raw);
  if (!sign) return { title: "Not found" };
  const ham = await findPublicHamByCallsign(sign);
  if (!ham) return { title: "Not found" };

  const t = await getTranslations({ locale, namespace: "ham" });
  const branding = await getPublicSiteBranding(locale);
  const description = t("description", {
    sign: ham.callsign,
    name: ham.name,
  });
  const canonical = hamPublicUrl(ham.callsign);
  const base = getPublicBaseUrl();

  return {
    title: ham.callsign,
    description,
    alternates: {
      canonical,
      languages: {
        vi: `${base}/vi/${ham.callsign}`,
        en: `${base}/en/${ham.callsign}`,
      },
    },
    openGraph: {
      title: `${ham.callsign} - ${branding.siteName}`,
      description,
      url: canonical,
    },
  };
}

export default async function HamProfilePage({ params, searchParams }: Props) {
  const { locale: localeParam, callsign: raw } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const { tab: tabParam } = await searchParams;
  const sign = parseHamPathParam(raw);
  if (!sign) notFound();
  if (raw !== sign) {
    const qs =
      tabParam === "profile" ||
      tabParam === "documents" ||
      tabParam === "logbook" ||
      tabParam === "qsl"
        ? `?tab=${tabParam}`
        : "";
    redirect(`/${locale}/${sign}${qs}`);
  }

  const ham = await findPublicHamByCallsign(sign);
  if (!ham) notFound();

  const [t, session, qsos, accountT] = await Promise.all([
    getTranslations("ham"),
    auth(),
    listUserQsos(ham.id),
    getTranslations("account"),
  ]);
  const canEdit = session?.user?.id === ham.id;
  const canAdminManage = Boolean(
    session?.user?.id && !canEdit && canManageUsers(session.user),
  );
  const viewerProfile =
    session?.user?.id && !canEdit
      ? await getAccountProfile(session.user.id, session.user.email)
      : null;
  const canLogWithOperator = Boolean(viewerProfile?.callsign?.trim());
  const activeTab = parseHamTab(tabParam, canEdit);
  const verified = ham.callsignVerified;
  const birthdayLabel = formatBirthdayDmy(ham.birthday) || null;
  const genderLabel =
    ham.gender === "male"
      ? t("genderMale")
      : ham.gender === "female"
        ? t("genderFemale")
        : ham.gender === "other"
          ? t("genderOther")
          : null;

  const [profile, documents] = canEdit
    ? await Promise.all([
        getAccountProfile(ham.id, session?.user?.email),
        listUserDocuments(ham.id),
      ])
    : [null, null];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
      <SetLocaleAlternates
        vi={hamHref(ham.callsign)}
        en={hamHref(ham.callsign)}
      />

      <p className="text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
        {t("eyebrow")}
      </p>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start">
        {ham.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ham.image}
            alt=""
            className="h-24 w-24 shrink-0 rounded-full border border-border object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="font-display text-5xl tracking-wide text-foreground md:text-6xl">
            {ham.callsign}
          </h1>
          {verified ? null : (
            <p className="mt-2 text-xs text-amber-800">{t("unverified")}</p>
          )}
          <p className="mt-2 text-lg text-foreground">{ham.name}</p>
          {genderLabel || birthdayLabel ? (
            <p className="mt-1 text-sm text-muted">
              {[genderLabel, birthdayLabel].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      {ham.archiveExists ? (
        <p className="mt-6 text-sm text-muted">
          <Link
            href={callsignHref(ham.callsign)}
            className="text-accent hover:underline"
          >
            {t("licenseHistory")}
          </Link>
        </p>
      ) : null}

      <HamProfileTabs
        callsign={ham.callsign}
        active={activeTab}
        isOwner={canEdit}
        profile={
          canEdit && profile ? (
            <AccountProfileForm
              initial={{
                name: profile.name,
                email: profile.email,
                callsign: profile.callsign,
                birthday: profile.birthday,
                gender: profile.gender,
              }}
            />
          ) : null
        }
        logbook={
          <QsoLogbook
            initialQsos={qsos}
            stationCallsign={ham.callsign}
            canEdit={canEdit}
            canLogWithOperator={canLogWithOperator}
            canAdminManage={canAdminManage}
            logbookUserId={ham.id}
          />
        }
        documents={
          canEdit && documents ? (
            <UserDocumentsPanel
              initialDocuments={documents}
              uploadEndpoint="/api/account/documents"
              labels={{
                certificate: accountT("certificate"),
                license: accountT("license"),
                upload: accountT("upload"),
                uploading: accountT("uploading"),
                uploadFailed: accountT("uploadFailed"),
                delete: accountT("delete"),
                deleteFailed: accountT("deleteFailed"),
                noDocuments: accountT("noDocuments"),
              }}
            />
          ) : null
        }
        qsl={canEdit ? <div /> : null}
      />
    </div>
  );
}
