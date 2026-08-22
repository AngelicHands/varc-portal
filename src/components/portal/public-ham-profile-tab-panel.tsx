"use client";

import { useTranslations } from "next-intl";
import type { ProfileGender } from "@/lib/account-types";
import { formatProfileAddress } from "@/lib/countries";
import {
  canViewHamBasicProfile,
  canViewHamLocation,
  type ViewerAccess,
} from "@/lib/ham-privacy";
import { formatMaidenheadDisplay } from "@/lib/maidenhead";
import { formatBirthdayDmy } from "@/lib/validations/qso";

type HamProfile = {
  isProfilePublic: boolean;
  isLocationPublic: boolean;
  name: string;
  image: string | null;
  callsign: string;
  callsignVerified: boolean;
  birthday: string | null;
  gender: ProfileGender;
  homeGrid: string;
  address: string;
  addressCountry: string;
};

type Props = {
  ham: HamProfile;
  locale: string;
  access: ViewerAccess;
};

const cardClass = "rounded-lg border border-border bg-surface p-4 md:p-5";

function FieldCard({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${cardClass} ${className}`.trim()}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function PublicHamProfileTabPanel({ ham, locale, access }: Props) {
  const accountT = useTranslations("account");
  const hamT = useTranslations("ham");

  const showBasic = canViewHamBasicProfile(ham, access);
  const showLocation = canViewHamLocation(ham, access);
  const showGender = access.canAdminManage;
  const birthdayLabel = showBasic ? formatBirthdayDmy(ham.birthday) : "";
  const addressLabel =
    showLocation && (ham.address.trim() || ham.addressCountry.trim())
      ? formatProfileAddress(ham.address, ham.addressCountry, locale)
      : "";
  const genderLabel =
    ham.gender === "male"
      ? accountT("genderMale")
      : ham.gender === "female"
        ? accountT("genderFemale")
        : ham.gender === "other"
          ? accountT("genderOther")
          : "";

  if (!showBasic && !showLocation) {
    return (
      <p className="text-sm text-muted">{accountT("securityProfilePrivateNotice")}</p>
    );
  }

  return (
    <div className="grid gap-4">
      {access.canAdminManage && !ham.isProfilePublic ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {hamT("adminPrivateProfileNotice")}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {showBasic && ham.image ? (
          <FieldCard label={accountT("avatar")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ham.image}
              alt=""
              className="h-20 w-20 rounded-full border border-border object-cover"
            />
          </FieldCard>
        ) : null}

        {showBasic ? (
          <FieldCard label={accountT("name")}>{ham.name.trim() || "—"}</FieldCard>
        ) : null}

        <FieldCard label={accountT("callsign")}>
          <div className="flex items-center gap-2">
            <span>{ham.callsign}</span>
            {showBasic && ham.callsignVerified ? (
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
        </FieldCard>

        {showBasic && birthdayLabel ? (
          <FieldCard label={accountT("birthday")}>{birthdayLabel}</FieldCard>
        ) : null}

        {showGender && genderLabel ? (
          <FieldCard label={accountT("gender")}>{genderLabel}</FieldCard>
        ) : null}

        {showLocation && ham.homeGrid ? (
          <FieldCard label={accountT("homeGrid")}>
            {formatMaidenheadDisplay(ham.homeGrid)}
          </FieldCard>
        ) : null}

        {showLocation && addressLabel ? (
          <FieldCard label={accountT("address")} className="md:col-span-2">
            <span className="whitespace-pre-wrap">{addressLabel}</span>
          </FieldCard>
        ) : null}
      </div>

      {showBasic && !showLocation && ham.isProfilePublic && !access.canAdminManage ? (
        <p className="text-sm text-muted">{accountT("securityLocationPrivateNotice")}</p>
      ) : null}
    </div>
  );
}
