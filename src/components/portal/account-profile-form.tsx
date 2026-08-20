"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateProfileAction } from "@/lib/account-actions";
import type { ProfileGender } from "@/lib/account-types";
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
    birthday: string | null;
    gender: ProfileGender;
  };
};

const cardClass =
  "rounded-lg border border-border bg-surface p-4 md:p-5";

export function AccountProfileForm({ initial }: Props) {
  const t = useTranslations("account");
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? "");
  const [callsign, setCallsign] = useState(initial.callsign ?? "");
  const [birthday, setBirthday] = useState(initial.birthday ?? "");
  const [gender, setGender] = useState<ProfileGender>(initial.gender ?? "");
  const [savedCallsign, setSavedCallsign] = useState(initial.callsign ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const birthdayInputRef = useRef<HTMLInputElement>(null);

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

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const birthdayIso = parseBirthdayInput(birthday);
    if (birthdayIso === null) {
      setError(t("birthdayInvalid"));
      return;
    }
    startTransition(async () => {
      const result = await updateProfileAction({
        name,
        callsign,
        birthday: birthdayIso,
        gender,
      });
      if (result.ok) {
        const next = callsign.trim().toUpperCase();
        const previous = savedCallsign;
        setMessage(t("saved"));
        setSavedCallsign(next);
        if (next && next !== previous) {
          router.replace({
            pathname: "/[callsign]",
            params: { callsign: next },
            query: { tab: "profile" },
          });
        }
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className={cardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("email")}
          </p>
          <p className="mt-2 break-all text-sm text-foreground">
            {initial.email ?? ""}
          </p>
        </div>

        <label className={`block text-sm ${cardClass}`}>
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("name")}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>

        <label className={`block text-sm ${cardClass}`}>
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("callsign")}
          </span>
          <input
            value={callsign}
            onChange={(e) => setCallsign(e.target.value.toUpperCase())}
            required
            placeholder="XV1ABC"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 uppercase"
          />
          <span className="mt-2 block text-xs text-muted">{t("callsignHelp")}</span>
        </label>

        <div className={`text-sm ${cardClass}`}>
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("birthday")}
          </span>
          <button
            type="button"
            onClick={openBirthdayPicker}
            className="mt-2 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-foreground/5"
          >
            <span className={birthday ? "text-foreground" : "text-muted"}>
              {formatBirthdayDmy(birthday) || "dd/mm/yyyy"}
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
            value={birthday}
            min="1900-01-01"
            max={maxBirthdayIso()}
            onChange={(e) => setBirthday(e.target.value)}
            aria-label={t("birthday")}
            tabIndex={-1}
            className="sr-only"
          />
        </div>

        <label className={`block text-sm ${cardClass}`}>
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("gender")}
          </span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as ProfileGender)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="">{t("genderUnspecified")}</option>
            <option value="male">{t("genderMale")}</option>
            <option value="female">{t("genderFemale")}</option>
            <option value="other">{t("genderOther")}</option>
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
