"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateFormSubmissionStatusAction } from "@/lib/actions";
import { notifyAction } from "@/components/admin/admin-toast";
import type { FormSubmissionStatus } from "@/lib/validations/forms";

type Props = {
  submissionId: string;
  currentStatus: FormSubmissionStatus;
};

const statuses: FormSubmissionStatus[] = ["new", "reviewed", "archived"];

export function FormSubmissionStatusControls({
  submissionId,
  currentStatus,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          disabled={pending || currentStatus === status}
          onClick={() => {
            startTransition(async () => {
              const result = await updateFormSubmissionStatusAction(
                submissionId,
                status,
              );
              if (!notifyAction(result, "Submission updated")) return;
              router.refresh();
            });
          }}
          className={`rounded px-3 py-1.5 text-sm transition ${
            currentStatus === status
              ? "bg-gray-900 text-white"
              : "border border-gray-300 bg-white hover:bg-gray-50"
          }`}
        >
          {status}
        </button>
      ))}
    </div>
  );
}
