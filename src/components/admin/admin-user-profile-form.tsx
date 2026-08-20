"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAdminUserAction } from "@/lib/actions";
import { notifyAction } from "@/components/admin/admin-toast";

type Props = {
  userId: string;
  initialName: string;
  initialCallsign: string;
};

export function AdminUserProfileForm({
  userId,
  initialName,
  initialCallsign,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [callsign, setCallsign] = useState(initialCallsign);

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
          onChange={(e) => setCallsign(e.target.value.toUpperCase())}
          placeholder="XV1ABC"
          className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
        />
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
