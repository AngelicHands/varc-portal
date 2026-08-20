"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyUserCallsignAction } from "@/lib/actions";
import { notifyAction } from "@/components/admin/admin-toast";
import { useConfirm } from "@/components/admin/use-confirm";
import type { CallsignVerificationStatus } from "@/lib/account-types";

type Props = {
  userId: string;
  callsign: string;
  status: CallsignVerificationStatus;
};

export function CallsignStatusCard({ userId, callsign, status }: Props) {
  const router = useRouter();
  const { ask, modal } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [statusState, setStatusState] = useState<CallsignVerificationStatus>(status);

  const sign = callsign.trim();
  const hasCallsign = Boolean(sign);
  const tone = !hasCallsign
    ? "empty"
    : statusState === "verified"
      ? "verified"
      : statusState === "pending"
        ? "pending"
        : statusState === "rejected"
          ? "rejected"
          : "unverified";
  const toneClass =
    tone === "verified"
      ? "border-green-300 bg-green-50"
      : tone === "pending"
        ? "border-blue-300 bg-blue-50"
        : tone === "rejected"
          ? "border-red-300 bg-red-50"
      : tone === "unverified"
        ? "border-amber-300 bg-amber-50"
        : "border-gray-200 bg-white";
  const labelClass =
    tone === "verified"
      ? "text-green-700"
      : tone === "pending"
        ? "text-blue-800"
        : tone === "rejected"
          ? "text-red-800"
      : tone === "unverified"
        ? "text-amber-800"
        : "text-gray-500";
  const valueClass =
    tone === "verified"
      ? "text-green-900"
      : tone === "pending"
        ? "text-blue-950"
        : tone === "rejected"
          ? "text-red-950"
      : tone === "unverified"
        ? "text-amber-950"
        : "text-gray-900";
  const hintClass =
    tone === "verified"
      ? "text-green-800"
      : tone === "pending"
        ? "text-blue-800"
        : tone === "rejected"
          ? "text-red-800"
      : tone === "unverified"
        ? "text-amber-800"
        : "text-gray-600";
  const hint = !hasCallsign
    ? "No callsign assigned"
    : statusState === "verified"
      ? "Verified"
      : statusState === "pending"
        ? "Pending verification"
        : statusState === "rejected"
          ? "Rejected"
          : "Not verified";

  async function onApprove() {
    const confirmed = await ask({
      title: "Approve callsign verification?",
      message: `Approve ${sign} for this user?`,
      confirmLabel: "Approve",
      variant: "default",
    });
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await verifyUserCallsignAction(userId, "approve");
      if (!notifyAction(result, "Callsign approved")) {
        setError(result.error);
        return;
      }
      setStatusState(result.status);
      router.refresh();
    });
  }

  async function onReject() {
    const confirmed = await ask({
      title: "Reject callsign verification?",
      message: `Reject verification for ${sign}? The user can request verification again later.`,
      confirmLabel: "Reject",
      variant: "danger",
    });
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await verifyUserCallsignAction(userId, "reject");
      if (!notifyAction(result, "Callsign rejected")) {
        setError(result.error);
        return;
      }
      setStatusState(result.status);
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
          <div className="mt-auto flex justify-end gap-2 pt-4">
            {statusState === "pending" ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void onReject()}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Reject"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void onApprove()}
                  className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Approve"}
                </button>
              </>
            ) : statusState === "verified" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void onReject()}
                className="rounded border border-green-400 bg-white px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Reject"}
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => void onApprove()}
                className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Approve"}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {modal}
    </>
  );
}
