"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PortalDialog } from "@/components/portal/portal-dialog";
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
import {
  formatBirthdayDmy,
  maxBirthdayIso,
  parseBirthdayInput,
} from "@/lib/validations/qso";

type Props = {
  initial: {
    name: string;
    email: string;
    callsign: string;
    callsignVerified: boolean;
    callsignVerificationStatus: CallsignVerificationStatus;
    birthday: string | null;
    gender: ProfileGender;
  };
  initialDocuments: UserDocumentDto[];
};

type EditField = "name" | "callsign" | "birthday" | "gender";

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
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? "");
  const [callsign, setCallsign] = useState(initial.callsign ?? "");
  const [birthday, setBirthday] = useState(initial.birthday ?? "");
  const [gender, setGender] = useState<ProfileGender>(initial.gender ?? "");
  const [verificationStatus, setVerificationStatus] = useState<CallsignVerificationStatus>(
    initial.callsignVerificationStatus,
  );
  const [documents, setDocuments] = useState<UserDocumentDto[]>(initialDocuments);
  const [savedCallsign, setSavedCallsign] = useState(initial.callsign ?? "");
  const [editField, setEditField] = useState<EditField | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftCallsign, setDraftCallsign] = useState("");
  const [draftBirthday, setDraftBirthday] = useState("");
  const [draftGender, setDraftGender] = useState<ProfileGender>("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const birthdayInputRef = useRef<HTMLInputElement>(null);

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

  function openBirthdayPicker() {
    const input = birthdayInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  function openEdit(field: EditField) {
    setError(null);
    setEditField(field);
    if (field === "name") setDraftName(name);
    if (field === "callsign") setDraftCallsign(callsign);
    if (field === "birthday") setDraftBirthday(birthday);
    if (field === "gender") setDraftGender(gender);
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

  function saveProfile(next: {
    name: string;
    callsign: string;
    birthday: string;
    gender: ProfileGender;
  }) {
    setMessage(null);
    setError(null);
    const birthdayIso = parseBirthdayInput(next.birthday);
    if (birthdayIso === null) {
      setError(t("birthdayInvalid"));
      return;
    }
    startTransition(async () => {
      const result = await updateProfileAction({
        name: next.name,
        callsign: next.callsign,
        birthday: birthdayIso,
        gender: next.gender,
      });
      if (result.ok) {
        const nextCallsign = next.callsign.trim().toUpperCase();
        const previous = savedCallsign;
        const callsignDidChange = nextCallsign !== previous;
        setName(next.name);
        setCallsign(nextCallsign);
        setBirthday(next.birthday);
        setGender(next.gender);
        if (callsignDidChange) {
          setVerificationStatus("unverified");
        }
        setMessage(t("saved"));
        setSavedCallsign(nextCallsign);
        setEditField(null);
        if (nextCallsign && nextCallsign !== previous) {
          router.replace({
            pathname: "/[callsign]",
            params: { callsign: nextCallsign },
            query: { tab: "profile" },
          });
        }
        router.refresh();
      } else {
        setError(result.error);
      }
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

  function onSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editField) return;
    saveProfile({
      name: editField === "name" ? draftName : name,
      callsign: editField === "callsign" ? draftCallsign : callsign,
      birthday: editField === "birthday" ? draftBirthday : birthday,
      gender: editField === "gender" ? draftGender : gender,
    });
  }

  const editTitles: Record<EditField, string> = {
    name: t("name"),
    callsign: t("callsign"),
    birthday: t("birthday"),
    gender: t("gender"),
  };

  const canRequestVerification =
    callsign.trim().length > 0 &&
    (verificationStatus === "unverified" || verificationStatus === "rejected");
  const missingDocs = missingVerificationDocuments(documents);
  const missingDocsLabel = missingDocs
    .map((kind) => (kind === "certificate" ? t("certificate") : t("license")))
    .join(", ");

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

          <ProfileFieldCard
            label={t("birthday")}
            value={formatBirthdayDmy(birthday)}
            onEdit={() => openEdit("birthday")}
          />

          <ProfileFieldCard
            label={t("gender")}
            value={genderLabel(gender)}
            onEdit={() => openEdit("gender")}
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
                required
                autoFocus
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
                required
                autoFocus
                placeholder="XV1ABC"
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 uppercase"
              />
            </label>
          ) : null}

          {editField === "birthday" ? (
            <div className="text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t("birthday")}
              </span>
              <button
                type="button"
                onClick={openBirthdayPicker}
                className="mt-2 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-foreground/5"
              >
                <span
                  className={draftBirthday ? "text-foreground" : "text-muted"}
                >
                  {formatBirthdayDmy(draftBirthday) || "dd/mm/yyyy"}
                </span>
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4 shrink-0 text-muted"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="12" height="11" rx="1.5" />
                  <path d="M2 6.5h12M5 2v2M11 2v2" />
                </svg>
              </button>
              <input
                ref={birthdayInputRef}
                type="date"
                lang="en-GB"
                value={draftBirthday}
                min="1900-01-01"
                max={maxBirthdayIso()}
                onChange={(e) => setDraftBirthday(e.target.value)}
                aria-label={t("birthday")}
                tabIndex={-1}
                className="sr-only"
              />
            </div>
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
