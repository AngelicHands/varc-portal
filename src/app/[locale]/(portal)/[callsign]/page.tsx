import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { SetLocaleAlternates } from "@/components/portal/locale-alternates";
import { AccountProfileForm } from "@/components/portal/account-profile-form";
import { HamProfileTabs } from "@/components/portal/ham-profile-tabs";
import { QsoLogbook } from "@/components/portal/qso-logbook";
import { SecuritySettingsForm } from "@/components/portal/security-settings-form";
import { UserDocumentsPanel } from "@/components/portal/user-documents-panel";
import { getAccountProfile } from "@/lib/account";
import { findPublicHamByCallsign, hamPublicUrl } from "@/lib/ham-profile";
import { parseHamPathParam, parseHamTab, type HamTabId } from "@/lib/ham-reserved";
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
  const description = ham.isProfilePublic
    ? t("description", {
        sign: ham.callsign,
        name: ham.name,
      })
    : t("privateDescription", { sign: ham.callsign });
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
      tabParam === "qsl" ||
      tabParam === "security"
        ? `?tab=${tabParam}`
        : "";
    redirect(`/${locale}/${sign}${qs}`);
  }

  const ham = await findPublicHamByCallsign(sign);
  if (!ham) notFound();

  const [t, session, accountT] = await Promise.all([
    getTranslations("ham"),
    auth(),
    getTranslations("account"),
  ]);
  const canEdit = session?.user?.id === ham.id;
  const canAdminManage = Boolean(
    session?.user?.id && !canEdit && canManageUsers(session.user),
  );
  const isBlockedProfile = !canEdit && !canAdminManage && !ham.isProfilePublic;
  if (isBlockedProfile) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4 py-14 md:px-6">
        <SetLocaleAlternates
          vi={hamHref(ham.callsign)}
          en={hamHref(ham.callsign)}
        />
        <div className="w-full px-6 py-12 text-center">
          <p className="text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 font-display text-4xl text-foreground md:text-5xl">
            {ham.callsign}
          </h1>
          <p className="mt-4 text-lg text-foreground">{t("privateProfileTitle")}</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted">
            {t("privateProfileMessage")}
          </p>
        </div>
      </div>
    );
  }
  const canViewProfile = canEdit || canAdminManage || ham.isProfilePublic;
  const canViewLogbook = canEdit || canAdminManage || ham.isQsoPublic;

  const visibleTabs: HamTabId[] = canEdit
    ? ["profile", "logbook", "documents", "qsl", "security"]
    : [
        ...(canViewProfile ? (["profile"] as HamTabId[]) : []),
        ...(canViewLogbook ? (["logbook"] as HamTabId[]) : []),
      ];

  const viewerProfile =
    session?.user?.id && !canEdit
      ? await getAccountProfile(session.user.id, session.user.email)
      : null;
  const canLogWithOperator = canViewLogbook && Boolean(viewerProfile?.callsign?.trim());
  const activeTab = parseHamTab(tabParam, visibleTabs);
  const verified = ham.callsignVerified;
  const birthdayLabel = canViewProfile ? formatBirthdayDmy(ham.birthday) || null : null;
  const genderLabel = canViewProfile
    ? ham.gender === "male"
      ? t("genderMale")
      : ham.gender === "female"
        ? t("genderFemale")
        : ham.gender === "other"
          ? t("genderOther")
          : null
    : null;

  const ownerData = canEdit
    ? await Promise.all([
        getAccountProfile(ham.id, session?.user?.email),
        listUserDocuments(ham.id),
      ])
    : ([null, null] as const);
  const [profile, documents] = ownerData;
  const qsos = canViewLogbook ? await listUserQsos(ham.id) : [];
  const qsoLogbookKey = `${ham.id}:${qsos.length}:${qsos[0]?.id ?? "empty"}`;

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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-5xl tracking-wide text-foreground md:text-6xl">
              {ham.callsign}
            </h1>
            {verified ? (
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700"
                aria-label="Verified callsign"
                title="Verified callsign"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3.5 8.5 6.5 11.5 12.5 5.5" />
                </svg>
              </span>
            ) : null}
          </div>
          {canViewProfile && !verified ? (
            <p className="mt-2 text-xs text-amber-800">{t("unverified")}</p>
          ) : null}
          {canViewProfile ? (
            <p className="mt-2 text-lg text-foreground">{ham.name}</p>
          ) : (
            <p className="mt-2 text-sm text-muted">{accountT("securityProfilePrivateNotice")}</p>
          )}
          {genderLabel || birthdayLabel ? (
            <p className="mt-1 text-sm text-muted">
              {[genderLabel, birthdayLabel].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      {canViewProfile && ham.archiveExists ? (
        <p className="mt-6 text-sm text-muted">
          <Link
            href={callsignHref(ham.callsign)}
            className="text-accent hover:underline"
          >
            {t("licenseHistory")}
          </Link>
        </p>
      ) : null}

      {canEdit || canAdminManage ? (
        <div className="mt-8 flex justify-end">
          <p className="text-sm text-muted">
            {accountT("securityProfileAccess")}:{" "}
            <span className="font-medium text-foreground">
              {ham.isProfilePublic
                ? accountT("securityStatusPublic")
                : accountT("securityStatusPrivate")}
            </span>
          </p>
        </div>
      ) : null}

      <HamProfileTabs
        callsign={ham.callsign}
        active={activeTab}
        isOwner={canEdit}
        canViewProfile={canViewProfile}
        canViewLogbook={canViewLogbook}
        profile={
          canEdit && profile ? (
            <AccountProfileForm
              initial={{
                name: profile.name,
                email: profile.email,
                callsign: profile.callsign,
                callsignVerified: profile.callsignVerified,
                callsignVerificationStatus: profile.callsignVerificationStatus,
                birthday: profile.birthday,
                gender: profile.gender,
              }}
              initialDocuments={documents ?? []}
            />
          ) : canViewProfile ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface p-4 md:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {accountT("name")}
                </p>
                <p className="mt-2 text-sm text-foreground">{ham.name}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 md:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {accountT("callsign")}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-sm text-foreground">{ham.callsign}</p>
                  {verified ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700"
                      aria-label="Verified callsign"
                      title="Verified callsign"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3.5 w-3.5"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3.5 8.5 6.5 11.5 12.5 5.5" />
                      </svg>
                    </span>
                  ) : null}
                </div>
              </div>
              {genderLabel || birthdayLabel ? (
                <div className="rounded-lg border border-border bg-surface p-4 md:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {t("publicDetails")}
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {[genderLabel, birthdayLabel].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null
        }
        logbook={
          canViewLogbook ? (
            <QsoLogbook
              key={qsoLogbookKey}
              initialQsos={qsos}
              stationCallsign={ham.callsign}
              canEdit={canEdit}
              canLogWithOperator={canLogWithOperator}
              canAdminManage={canAdminManage}
              logbookUserId={ham.id}
            />
          ) : (
            <p className="text-sm text-muted">{accountT("securityQsoPrivateNotice")}</p>
          )
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
        security={
          canEdit && profile ? (
            <SecuritySettingsForm
              initial={{
                isProfilePublic: profile.isProfilePublic,
                isQsoPublic: profile.isQsoPublic,
              }}
            />
          ) : null
        }
      />
    </div>
  );
}
