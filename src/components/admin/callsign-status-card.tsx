"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyUserCallsignAction } from "@/lib/actions";
import { notifyAction } from "@/components/admin/admin-toast";
import { useConfirm } from "@/components/admin/use-confirm";

type Props = {
  userId: string;
  callsign: string;
  verified: boolean;
};

export function CallsignStatusCard({ userId, callsign, verified }: Props) {
  const router = useRouter();
  const { ask, modal } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [verifiedState, setVerifiedState] = useState(verified);
  const isVerified = verifiedState;

  const sign = callsign.trim();
  const hasCallsign = Boolean(sign);
  const tone = !hasCallsign
    ? "empty"
    : isVerified
      ? "verified"
      : "unverified";
  const toneClass =
    tone === "verified"
      ? "border-green-300 bg-green-50"
      : tone === "unverified"
        ? "border-amber-300 bg-amber-50"
        : "border-gray-200 bg-white";
  const labelClass =
    tone === "verified"
      ? "text-green-700"
      : tone === "unverified"
        ? "text-amber-800"
        : "text-gray-500";
  const valueClass =
    tone === "verified"
      ? "text-green-900"
      : tone === "unverified"
        ? "text-amber-950"
        : "text-gray-900";
  const hintClass =
    tone === "verified"
      ? "text-green-800"
      : tone === "unverified"
        ? "text-amber-800"
        : "text-gray-600";
  const hint = !hasCallsign
    ? "No callsign assigned"
    : isVerified
      ? "Verified"
      : "Not verified";

  async function onVerify() {
    const confirmed = await ask({
      title: "Verify callsign?",
      message: `Mark ${sign} as verified? This confirms the callsign belongs to this user.`,
      confirmLabel: "Verify",
      variant: "default",
    });
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await verifyUserCallsignAction(userId, true);
      if (!notifyAction(result, "Callsign verified")) {
        setError(result.error);
        return;
      }
      setVerifiedState(result.verified);
      router.refresh();
    });
  }

  async function onDeactivate() {
    const confirmed = await ask({
      title: "Deactivate callsign?",
      message: `Mark ${sign} as not verified? The user will keep this callsign until you change it.`,
      confirmLabel: "Deactivate",
      variant: "danger",
    });
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await verifyUserCallsignAction(userId, false);
      if (!notifyAction(result, "Callsign deactivated")) {
        setError(result.error);
        return;
      }
      setVerifiedState(result.verified);
      router.refresh();
    });
  }

  return (
    <>
      <div className={`flex h-full flex-col rounded-lg border p-5 ${toneClass}`}>
        <div className="flex items-start justify-between gap-3">
          <p className={`text-xs font-medium uppercase tracking-wide ${labelClass}`}>
            Callsign
          </p>
          {hasCallsign ? (
            <Link
              href={`/${sign}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-normal normal-case text-blue-700 hover:underline"
            >
              View profile
            </Link>
          ) : null}
        </div>
        <p className={`mt-2 truncate text-2xl font-semibold ${valueClass}`}>
          {sign || "—"}
        </p>
        <p className={`mt-1 text-sm ${hintClass}`}>{hint}</p>
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        {hasCallsign ? (
          <div className="mt-auto flex justify-end pt-4">
            {isVerified ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void onDeactivate()}
                className="rounded border border-green-400 bg-white px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Deactivate"}
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => void onVerify()}
                className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Verify"}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {modal}
    </>
  );
}
