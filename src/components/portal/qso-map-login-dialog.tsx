"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import {
  portalCredentialsSignInAction,
  portalGoogleSignInAction,
} from "@/lib/portal-auth-actions";
import {
  HAM_MAP_THEME_EVENT,
  readStoredHamMapTheme,
  type HamMapTheme,
} from "@/lib/map/maptiler-style";

type Props = {
  open: boolean;
  hasGoogle: boolean;
  onClose: () => void;
  callbackUrl?: string;
};

export function QsoMapLoginDialog({
  open,
  hasGoogle,
  onClose,
  callbackUrl = "/qso",
}: Props) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mapTheme, setMapTheme] = useState<HamMapTheme>("light");

  useEffect(() => {
    const sync = () => setMapTheme(readStoredHamMapTheme());
    sync();
    window.addEventListener(HAM_MAP_THEME_EVENT, sync);
    return () => window.removeEventListener(HAM_MAP_THEME_EVENT, sync);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await portalCredentialsSignInAction({
        email,
        password,
        callbackUrl,
      });
      if (!result.ok) setError(t("failed"));
    });
  }

  const light = mapTheme === "light";
  const panelClass = light
    ? "border-zinc-300/80 bg-white/95 text-zinc-900 shadow-xl shadow-zinc-900/15"
    : "border-white/10 bg-zinc-950/95 text-white shadow-2xl shadow-black/50";
  const titleClass = light ? "text-zinc-900" : "text-white";
  const closeClass = light
    ? "text-zinc-500 hover:bg-zinc-100"
    : "text-white/60 hover:bg-white/10";
  const bodyClass = light ? "text-zinc-600" : "text-white/70";
  const labelClass = light ? "text-zinc-500" : "text-white/55";
  const fieldClass = light
    ? "border-zinc-300 bg-white text-zinc-900"
    : "border-white/15 bg-white/5 text-white";
  const submitClass = light
    ? "bg-zinc-900 text-white hover:bg-zinc-800"
    : "bg-white text-zinc-950 hover:bg-white/90";
  const googleClass = light
    ? "border-zinc-300 text-zinc-800 hover:bg-zinc-100"
    : "border-white/20 text-white hover:bg-white/10";
  const errorClass = light
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-red-400/30 bg-red-500/15 text-red-100";
  const overlayClass = light ? "bg-zinc-900/35" : "bg-black/60";

  return (
    <PortalDialog
      open={open}
      title={t("loginTitle")}
      onClose={onClose}
      closeDisabled={pending}
      zIndex={130}
      overlayClassName={overlayClass}
      panelClassName={panelClass}
      titleClassName={titleClass}
      closeClassName={closeClass}
    >
      <p className={`text-sm ${bodyClass}`}>
        {hasGoogle ? t("loginLedeGoogle") : t("loginLede")}
      </p>
      {error ? (
        <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${errorClass}`}>
          {error}
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className={`mb-1.5 block text-xs font-medium tracking-wide uppercase ${labelClass}`}>
            {t("email")}
          </span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            disabled={pending}
            onChange={(event) => setEmail(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-50 ${fieldClass}`}
          />
        </label>
        <label className="block text-sm">
          <span className={`mb-1.5 block text-xs font-medium tracking-wide uppercase ${labelClass}`}>
            {t("password")}
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={pending}
            onChange={(event) => setPassword(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-50 ${fieldClass}`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className={`w-full rounded-md px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${submitClass}`}
        >
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
      {hasGoogle ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              await portalGoogleSignInAction(callbackUrl);
            });
          }}
          className={`mt-4 inline-flex w-full items-center justify-center gap-2.5 rounded-md border px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${googleClass}`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {t("google")}
        </button>
      ) : null}
    </PortalDialog>
  );
}
