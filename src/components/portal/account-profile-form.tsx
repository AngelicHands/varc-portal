"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { updateProfileAction } from "@/lib/account-actions";

type Props = {
  initial: {
    name: string;
    email: string;
    callsign: string;
  };
};

export function AccountProfileForm({ initial }: Props) {
  const t = useTranslations("account");
  const [name, setName] = useState(initial.name ?? "");
  const [callsign, setCallsign] = useState(initial.callsign ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateProfileAction({ name, callsign });
      if (result.ok) {
        setMessage(t("saved"));
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-foreground">{t("email")}</span>
        <input
          value={initial.email ?? ""}
          readOnly
          className="w-full rounded-md border border-border bg-foreground/5 px-3 py-2 text-muted"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-foreground">{t("name")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-md border border-border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-foreground">{t("callsign")}</span>
        <input
          value={callsign}
          onChange={(e) => setCallsign(e.target.value.toUpperCase())}
          required
          placeholder="XV1ABC"
          className="w-full rounded-md border border-border px-3 py-2 uppercase"
        />
        <span className="mt-1 block text-xs text-muted">{t("callsignHelp")}</span>
      </label>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? t("saving") : t("save")}
        </button>
        <Link href="/logbook" className="text-sm text-accent hover:underline">
          {t("openLogbook")}
        </Link>
      </div>
    </form>
  );
}
