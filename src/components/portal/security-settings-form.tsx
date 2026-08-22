"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateSecuritySettingsAction } from "@/lib/account-actions";

type Props = {
  initial: {
    isProfilePublic: boolean;
    isQsoPublic: boolean;
  };
};

const cardClass = "rounded-lg border border-border bg-surface p-4 md:p-5";

function SecurityToggle({
  checked,
  onChange,
  title,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 text-sm ${cardClass}`}>
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : ""
        } ${
          checked
            ? "border-accent bg-accent"
            : "border-border bg-background"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
        <span className="sr-only">{title}</span>
      </button>
    </div>
  );
}

export function SecuritySettingsForm({ initial }: Props) {
  const t = useTranslations("account");
  const router = useRouter();
  const [isProfilePublic, setIsProfilePublic] = useState(initial.isProfilePublic);
  const [isQsoPublic, setIsQsoPublic] = useState(initial.isQsoPublic);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateSecuritySettingsAction({
        isProfilePublic,
        isQsoPublic,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(t("settingsSaved"));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <SecurityToggle
        checked={isProfilePublic}
        onChange={(next) => {
          setIsProfilePublic(next);
          if (!next) {
            setIsQsoPublic(false);
          }
        }}
        title={t("securityProfilePublic")}
        description={t("securityProfilePublicHelp")}
      />

      <SecurityToggle
        checked={isQsoPublic}
        onChange={setIsQsoPublic}
        title={t("securityQsoPublic")}
        description={
          isProfilePublic
            ? t("securityQsoPublicHelp")
            : t("securityQsoPublicDisabledHelp")
        }
        disabled={!isProfilePublic}
      />

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
          {pending ? t("savingSettings") : t("saveSettings")}
        </button>
      </div>
    </form>
  );
}
