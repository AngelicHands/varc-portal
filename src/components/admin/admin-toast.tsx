"use client";

import { Toaster, toast } from "sonner";

export function AdminToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "font-sans",
        },
      }}
    />
  );
}

type ActionFailure = { ok: false; error: string };
type ActionSuccess<T extends Record<string, unknown> = Record<string, unknown>> =
  { ok: true } & T;
type ActionResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ActionSuccess<T>
  | ActionFailure;

export function notifyAction<T extends Record<string, unknown>>(
  result: ActionResult<T>,
  successMessage: string,
): result is ActionSuccess<T> {
  if (result.ok) {
    toast.success(successMessage);
    return true;
  }
  const message = result.error || "Something went wrong";
  const [title, ...rest] = message.split("\n");
  if (rest.length > 0) {
    toast.error(title || "Something went wrong", {
      description: rest.join("\n"),
      duration: 8000,
    });
  } else {
    toast.error(message);
  }
  return false;
}

export function notifySuccess(message: string) {
  toast.success(message);
}

export function notifyError(message: string) {
  toast.error(message || "Something went wrong");
}
