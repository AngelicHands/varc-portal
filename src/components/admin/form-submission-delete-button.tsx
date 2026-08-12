"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteFormSubmissionAction } from "@/lib/actions";
import { notifyAction } from "@/components/admin/admin-toast";
import { useConfirm } from "@/components/admin/use-confirm";

type Props = {
  submissionId: string;
  formId: string;
  /** When set, navigate here after delete. Otherwise refresh in place. */
  redirectTo?: string;
  className?: string;
};

export function FormSubmissionDeleteButton({
  submissionId,
  formId,
  redirectTo,
  className,
}: Props) {
  const router = useRouter();
  const { ask, modal } = useConfirm();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const confirmed = await ask({
            title: "Delete submission",
            message:
              "Permanently delete this submission? Uploaded files will also be removed. This cannot be undone.",
            confirmLabel: "Delete permanently",
            variant: "danger",
          });
          if (!confirmed) return;
          startTransition(async () => {
            const result = await deleteFormSubmissionAction(submissionId);
            if (!notifyAction(result, "Submission deleted")) return;
            if (redirectTo) {
              router.push(redirectTo);
            } else {
              router.push(`/admin/forms/${formId}/submissions`);
            }
            router.refresh();
          });
        }}
        className={
          className ??
          "rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-60"
        }
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {modal}
    </>
  );
}
