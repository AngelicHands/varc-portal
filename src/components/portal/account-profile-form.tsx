"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { BirthdayInlineField } from "@/components/portal/birthday-inline-field";
import { UserDocumentsPanel } from "@/components/portal/user-documents-panel";
import {
  requestCallsignVerificationAction,
  updateProfileAction,
} from "@/lib/account-actions";
import type {
  CallsignVerificationStatus,
  ProfileGender,
  UserDocumentDto,
} from "@/lib/account-types";
import { hamPublicPath } from "@/lib/ham-reserved";
import {
  parseBirthdayInput,
} from "@/lib/validations/qso";
import { latLngToMaidenhead, formatMaidenheadDisplay } from "@/lib/maidenhead";
import {
  formatProfileAddress,
  profileCountryOptions,
} from "@/lib/countries";

type Props = {
  initial: {
    name: string;
    email: string;
    callsign: string;
    callsignVerified: boolean;
    callsignVerificationStatus: CallsignVerificationStatus;
    birthday: string | null;
    gender: ProfileGender;
    homeGrid: string;
    homeLat: number | null;
    homeLng: number | null;
    address: string;
    addressCountry: string;
  };
  initialDocuments: UserDocumentDto[];
};

type EditField = "name" | "callsign" | "gender" | "homeGrid" | "address";

/** Only the field(s) edited in a card — everything else is left untouched server-side. */
type ProfilePatch = {
  name?: string;
  callsign?: string;
  birthday?: string;
  gender?: ProfileGender;
  homeGrid?: string;
  homeLat?: number | null;
  homeLng?: number | null;
  address?: string;
  addressCountry?: string;
};

const cardClass =
  "flex h-full flex-col rounded-lg border border-border bg-surface p-4 md:p-5";

function ProfileFieldCard({
  label,
  value,
  badge,
  valueClass = "text-xl font-semibold text-foreground",
  onEdit,
  footerAction,
}: {
  label: string;
  value: string;
  badge?: { text: string; className: string };
  valueClass?: string;
  onEdit?: () => void;
  footerAction?: {
    label: string;
    onClick: () => void;
    className?: string;
    disabled?: boolean;
  };
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={label}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11.9 2.6a1.5 1.5 0 0 1 2.1 2.1l-7.6 7.6-3 0.9 0.9-3 7.6-7.6Z" />
              <path d="M10.5 4l1.5 1.5" />
            </svg>
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className={`break-words ${valueClass}`}>{value || "—"}</p>
        {badge ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
          >
            {badge.text}
          </span>
        ) : null}
      </div>
      {footerAction ? (
        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={footerAction.onClick}
            disabled={footerAction.disabled}
            className={
              footerAction.className ??
              "rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
            }
          >
            {footerAction.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function hasDocumentKind(documents: UserDocumentDto[], kind: "certificate" | "license") {
  return documents.some((doc) => doc.kind === kind);
}

export function AccountProfileForm({ initial, initialDocuments }: Props) {
  const t = useTranslations("account");
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? "");
  const [callsign, setCallsign] = useState(initial.callsign ?? "");
  const [birthday, setBirthday] = useState(initial.birthday ?? "");
  const [gender, setGender] = useState<ProfileGender>(initial.gender ?? "");
  const [homeGrid, setHomeGrid] = useState(initial.homeGrid ?? "");
  const [homeLat, setHomeLat] = useState<number | null>(initial.homeLat ?? null);
  const [homeLng, setHomeLng] = useState<number | null>(initial.homeLng ?? null);
  const [address, setAddress] = useState(initial.address ?? "");
  const [addressCountry, setAddressCountry] = useState(initial.addressCountry ?? "");
  const [verificationStatus, setVerificationStatus] = useState<CallsignVerificationStatus>(
    initial.callsignVerificationStatus,
  );
  const [documents, setDocuments] = useState<UserDocumentDto[]>(initialDocuments);
  const [savedCallsign, setSavedCallsign] = useState(initial.callsign ?? "");
  const [editField, setEditField] = useState<EditField | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftCallsign, setDraftCallsign] = useState("");
  const [draftGender, setDraftGender] = useState<ProfileGender>("");
  const [draftHomeGrid, setDraftHomeGrid] = useState("");
  const [draftHomeLat, setDraftHomeLat] = useState<number | null>(null);
  const [draftHomeLng, setDraftHomeLng] = useState<number | null>(null);
  const [draftAddress, setDraftAddress] = useState("");
  const [draftAddressCountry, setDraftAddressCountry] = useState("");
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function genderLabel(value: ProfileGender): string {
    if (value === "male") return t("genderMale");
    if (value === "female") return t("genderFemale");
    if (value === "other") return t("genderOther");
    return t("genderUnspecified");
  }

  function callsignStatusMeta(status: CallsignVerificationStatus) {
    if (status === "verified") {
      return {
        text: t("callsignStatusVerified"),
        className: "bg-green-100 text-green-800",
      };
    }
    if (status === "pending") {
      return {
        text: t("callsignStatusPending"),
        className: "bg-blue-100 text-blue-800",
      };
    }
    if (status === "rejected") {
      return {
        text: t("callsignStatusRejected"),
        className: "bg-red-100 text-red-800",
      };
    }
    return {
      text: t("callsignStatusUnverified"),
      className: "bg-amber-100 text-amber-800",
    };
  }

  function missingVerificationDocuments(current: UserDocumentDto[]) {
    const missing: Array<"certificate" | "license"> = [];
    if (!hasDocumentKind(current, "certificate")) missing.push("certificate");
    if (!hasDocumentKind(current, "license")) missing.push("license");
    return missing;
  }

  const callsignBadge =
    callsign.trim().length === 0
      ? undefined
      : callsignStatusMeta(verificationStatus);

  function openEdit(field: EditField) {
    setError(null);
    setEditField(field);
    if (field === "name") setDraftName(name);
    if (field === "callsign") setDraftCallsign(callsign);
    if (field === "gender") setDraftGender(gender);
    if (field === "homeGrid") {
      setDraftHomeGrid(homeGrid);
      setDraftHomeLat(homeLat);
      setDraftHomeLng(homeLng);
    }
    if (field === "address") {
      setDraftAddress(address);
      setDraftAddressCountry(addressCountry);
    }
  }

  function closeEdit() {
    if (pending) return;
    setEditField(null);
    setError(null);
  }

  function closeVerifyModal() {
    if (pending) return;
    setShowVerifyModal(false);
    setError(null);
  }

  function saveProfile(patch: ProfilePatch) {
    setMessage(null);
    setError(null);

    let birthdayIso: string | undefined;
    if (patch.birthday !== undefined) {
      const parsed = parseBirthdayInput(patch.birthday);
      if (parsed === null) {
        setError(t("birthdayInvalid"));
        return;
      }
      birthdayIso = parsed;
    }

    startTransition(async () => {
      const result = await updateProfileAction(
        birthdayIso === undefined ? patch : { ...patch, birthday: birthdayIso },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (patch.name !== undefined) setName(patch.name);
      if (birthdayIso !== undefined) setBirthday(birthdayIso);
      if (patch.gender !== undefined) setGender(patch.gender);
      if (patch.homeGrid !== undefined) {
        setHomeGrid(patch.homeGrid.trim().toUpperCase());
        setHomeLat(patch.homeLat ?? null);
        setHomeLng(patch.homeLng ?? null);
      }
      if (patch.address !== undefined) setAddress(patch.address);
      if (patch.addressCountry !== undefined) setAddressCountry(patch.addressCountry);

      const previous = savedCallsign;
      let nextCallsign = previous;
      if (patch.callsign !== undefined) {
        nextCallsign = patch.callsign.trim().toUpperCase();
        setCallsign(nextCallsign);
        setSavedCallsign(nextCallsign);
        if (nextCallsign !== previous) {
          setVerificationStatus("unverified");
        }
      }

      setMessage(t("saved"));
      setEditField(null);
      if (nextCallsign !== previous) {
        // The owner view lives at /{callsign}; with no callsign it moves back to /account.
        router.replace(
          nextCallsign
            ? `${hamPublicPath(nextCallsign)}?tab=profile`
            : `/${locale}/account?tab=profile`,
        );
      }
      router.refresh();
    });
  }

  function openVerificationFlow() {
    setMessage(null);
    setError(null);
    if (missingVerificationDocuments(documents).length > 0) {
      setShowVerifyModal(true);
      return;
    }

    startTransition(async () => {
      const result = await requestCallsignVerificationAction();
      if (!result.ok) {
        if (result.missing?.length) {
          setShowVerifyModal(true);
        } else {
          setError(result.error);
        }
        return;
      }
      setVerificationStatus(result.status);
      setShowVerifyModal(false);
      setMessage(t("callsignVerificationRequested"));
      router.refresh();
    });
  }

  function saveBirthday(iso: string) {
    saveProfile({ birthday: iso });
  }

  function onSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editField) return;
    if (editField === "name") {
      saveProfile({ name: draftName });
      return;
    }
    if (editField === "callsign") {
      saveProfile({ callsign: draftCallsign });
      return;
    }
    if (editField === "gender") {
      saveProfile({ gender: draftGender });
      return;
    }
    if (editField === "address") {
      saveProfile({
        address: draftAddress,
        addressCountry: draftAddressCountry,
      });
      return;
    }
    if (editField !== "homeGrid") return;
    // Grid and GPS point are saved together; coords may be edited after device lookup.
    const hasGrid = draftHomeGrid.trim().length > 0;
    const lat = draftHomeLat;
    const lng = draftHomeLng;
    if (hasGrid && (lat != null) !== (lng != null)) {
      setError(t("homeLocationCoordsPairRequired"));
      return;
    }
    if (lat != null && (lat < -90 || lat > 90)) {
      setError(t("homeLocationLatInvalid"));
      return;
    }
    if (lng != null && (lng < -180 || lng > 180)) {
      setError(t("homeLocationLngInvalid"));
      return;
    }
    saveProfile({
      homeGrid: draftHomeGrid,
      homeLat: hasGrid ? lat : null,
      homeLng: hasGrid ? lng : null,
    });
  }

  function parseDraftCoord(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }

  function onDraftLatChange(raw: string) {
    setDraftHomeLat(parseDraftCoord(raw));
  }

  function onDraftLngChange(raw: string) {
    setDraftHomeLng(parseDraftCoord(raw));
  }

  function useCurrentLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError(t("homeLocationUnsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const grid = latLngToMaidenhead(lat, lng, 6);
        if (!grid) {
          setLocating(false);
          setError(t("homeLocationFailed"));
          return;
        }
        setDraftHomeLat(lat);
        setDraftHomeLng(lng);
        setDraftHomeGrid(grid);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(t("homeLocationFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  function clearDraftLocation() {
    setDraftHomeLat(null);
    setDraftHomeLng(null);
  }

  const editTitles: Record<EditField, string> = {
    name: t("name"),
    callsign: t("callsign"),
    gender: t("gender"),
    homeGrid: t("homeGrid"),
    address: t("address"),
  };

  const canRequestVerification =
    callsign.trim().length > 0 &&
    (verificationStatus === "unverified" || verificationStatus === "rejected");
  const missingDocs = missingVerificationDocuments(documents);
  const missingDocsLabel = missingDocs
    .map((kind) => (kind === "certificate" ? t("certificate") : t("license")))
    .join(", ");
  const countryOptions = profileCountryOptions(locale);
  const addressDisplay =
    formatProfileAddress(address, addressCountry, locale).trim() || "—";

  return (
    <>
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ProfileFieldCard
            label={t("email")}
            value={initial.email ?? ""}
            valueClass="break-all text-sm text-foreground"
          />

          <ProfileFieldCard
            label={t("name")}
            value={name}
            onEdit={() => openEdit("name")}
          />

          <ProfileFieldCard
            label={t("callsign")}
            value={callsign}
            badge={callsignBadge}
            valueClass="truncate text-2xl font-semibold uppercase tracking-wide text-foreground"
            onEdit={() => openEdit("callsign")}
            footerAction={
              canRequestVerification
                ? {
                    label: t("verifyIt"),
                    onClick: openVerificationFlow,
                    className:
                      "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60",
                    disabled: pending,
                  }
                : undefined
            }
          />

          <div className={cardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t("birthday")}
            </p>
            <BirthdayInlineField
              key={birthday}
              value={birthday}
              disabled={pending}
              pickDateLabel={t("birthdayPickDate")}
              onCommit={saveBirthday}
              onInvalid={() => setError(t("birthdayInvalid"))}
            />
          </div>

          <ProfileFieldCard
            label={t("gender")}
            value={genderLabel(gender)}
            onEdit={() => openEdit("gender")}
          />

          <ProfileFieldCard
            label={t("homeGrid")}
            value={
              homeGrid
                ? homeLat != null && homeLng != null
                  ? `${formatMaidenheadDisplay(homeGrid)} · ${homeLat.toFixed(5)}, ${homeLng.toFixed(5)}`
                  : formatMaidenheadDisplay(homeGrid)
                : "—"
            }
            valueClass="text-xl font-semibold tracking-wide text-foreground"
            onEdit={() => openEdit("homeGrid")}
          />

          <ProfileFieldCard
            label={t("address")}
            value={addressDisplay}
            valueClass="whitespace-pre-wrap text-sm text-foreground"
            onEdit={() => openEdit("address")}
          />
        </div>

        {error && !editField ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </p>
        ) : null}
      </div>

      <PortalDialog
        open={editField !== null}
        title={editField ? editTitles[editField] : ""}
        onClose={closeEdit}
        closeDisabled={pending}
      >
        <form onSubmit={onSaveEdit} className="grid gap-4">
          {editField === "name" ? (
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t("name")}
              </span>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
                maxLength={120}
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
          ) : null}

          {editField === "callsign" ? (
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t("callsign")}
              </span>
              <input
                value={draftCallsign}
                onChange={(e) => setDraftCallsign(e.target.value.toUpperCase())}
                autoFocus
                maxLength={15}
                placeholder="XV1ABC"
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 uppercase"
              />
            </label>
          ) : null}

          {editField === "gender" ? (
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t("gender")}
              </span>
              <select
                value={draftGender}
                onChange={(e) =>
                  setDraftGender(e.target.value as ProfileGender)
                }
                autoFocus
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">{t("genderUnspecified")}</option>
                <option value="male">{t("genderMale")}</option>
                <option value="female">{t("genderFemale")}</option>
                <option value="other">{t("genderOther")}</option>
              </select>
            </label>
          ) : null}

          {editField === "address" ? (
            <div className="grid gap-4 text-sm">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("address")}
                </span>
                <input
                  type="text"
                  value={draftAddress}
                  onChange={(e) => setDraftAddress(e.target.value)}
                  autoFocus
                  maxLength={400}
                  placeholder={t("addressPlaceholder")}
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("addressCountry")}
                </span>
                <select
                  value={draftAddressCountry}
                  onChange={(e) => setDraftAddressCountry(e.target.value)}
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                >
                  <option value="">{t("addressCountryUnset")}</option>
                  {countryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {editField === "homeGrid" ? (
            <div className="grid gap-3 text-sm">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("homeGrid")}
                </span>
                <input
                  value={draftHomeGrid}
                  onChange={(e) => setDraftHomeGrid(e.target.value.toUpperCase())}
                  autoFocus
                  placeholder="OL20VX"
                  maxLength={12}
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 uppercase"
                />
              </label>
              <p className="text-xs text-muted">{t("homeLocationHelp")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    {t("homeLocationLat")}
                  </span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={draftHomeLat ?? ""}
                    onChange={(e) => onDraftLatChange(e.target.value)}
                    placeholder="21.02850"
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    {t("homeLocationLng")}
                  </span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={draftHomeLng ?? ""}
                    onChange={(e) => onDraftLngChange(e.target.value)}
                    placeholder="105.85420"
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </label>
              </div>
              {draftHomeLat == null && draftHomeLng == null ? (
                <p className="text-xs text-muted">{t("homeLocationMissing")}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  disabled={pending || locating}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
                >
                  {locating ? t("homeLocationLocating") : t("homeLocationUse")}
                </button>
                {draftHomeLat != null && draftHomeLng != null ? (
                  <button
                    type="button"
                    onClick={clearDraftLocation}
                    disabled={pending || locating}
                    className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
                  >
                    {t("homeLocationClear")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {error && editField ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeEdit}
              disabled={pending}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      </PortalDialog>

      <PortalDialog
        open={showVerifyModal}
        title={t("callsignVerificationModalTitle")}
        onClose={closeVerifyModal}
        closeDisabled={pending}
        size="lg"
      >
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            {missingDocs.length > 0
              ? t("callsignVerificationMissingDocs", {
                  documents: missingDocsLabel,
                })
              : t("callsignVerificationReady")}
          </p>

          <UserDocumentsPanel
            initialDocuments={documents}
            uploadEndpoint="/api/account/documents"
            onDocumentsChange={setDocuments}
            labels={{
              certificate: t("certificate"),
              license: t("license"),
              upload: t("upload"),
              uploading: t("uploading"),
              uploadFailed: t("uploadFailed"),
              delete: t("delete"),
              deleteFailed: t("deleteFailed"),
              noDocuments: t("noDocuments"),
            }}
          />

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeVerifyModal}
              disabled={pending}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={openVerificationFlow}
              disabled={pending || missingVerificationDocuments(documents).length > 0}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? t("saving") : t("verifyIt")}
            </button>
          </div>
        </div>
      </PortalDialog>
    </>
  );
}
