"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAdminUserAction } from "@/lib/actions";
import { notifyAction } from "@/components/admin/admin-toast";

type Props = {
  userId: string;
  initialName: string;
  initialCallsign: string;
  initialCallsignVerified: boolean;
};

export function AdminUserProfileForm({
  userId,
  initialName,
  initialCallsign,
  initialCallsignVerified,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [callsign, setCallsign] = useState(initialCallsign);
  const [callsignVerified, setCallsignVerified] = useState(
    initialCallsignVerified,
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateAdminUserAction(userId, {
            name,
            callsign,
            callsignVerified: Boolean(callsign.trim()) && callsignVerified,
          });
          if (!notifyAction(result, "User updated")) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Callsign</span>
        <input
          value={callsign}
          onChange={(e) => {
            const next = e.target.value.toUpperCase();
            setCallsign(next);
            if (!next.trim() || next.trim() !== initialCallsign) {
              setCallsignVerified(false);
            } else {
              setCallsignVerified(initialCallsignVerified);
            }
          }}
          placeholder="XV1ABC"
          className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Callsign status</span>
        <select
          value={callsignVerified ? "verified" : "not_verified"}
          disabled={!callsign.trim()}
          onChange={(e) => setCallsignVerified(e.target.value === "verified")}
          className="w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="not_verified">Not verified</option>
          <option value="verified">Verified</option>
        </select>
      </label>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
