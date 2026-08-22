"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { changePasswordAction } from "@/lib/account-actions";

type Props = {
  hasPassword: boolean;
};

const cardClass = "rounded-lg border border-border bg-surface p-4 md:p-5";
const fieldClass =
  "mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function PasswordChangeDialog({
  open,
  hasPassword,
  onClose,
  onSuccess,
}: {
  open: boolean;
  hasPassword: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    resetFields();
    onClose();
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
        confirmPassword,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      resetFields();
      onSuccess();
    });
  }

  return (
    <PortalDialog
      open={open}
      title={hasPassword ? t("passwordChangeTitle") : t("passwordSetTitle")}
      onClose={handleClose}
      closeDisabled={pending}
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <p className="text-sm text-muted">
          {hasPassword ? t("passwordChangeHelp") : t("passwordSetHelp")}
        </p>

        {hasPassword ? (
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              {t("passwordCurrent")}
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              disabled={pending}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={fieldClass}
            />
          </label>
        ) : null}

        <label className="block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("passwordNew")}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            disabled={pending}
            onChange={(event) => setNewPassword(event.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("passwordConfirm")}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            disabled={pending}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={fieldClass}
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t("passwordSaving") : t("passwordSave")}
          </button>
        </div>
      </form>
    </PortalDialog>
  );
}

export function SecurityTabPanel({ hasPassword: initialHasPassword }: Props) {
  const t = useTranslations("account");
  const [passwordSetLocally, setPasswordSetLocally] = useState(false);
  const hasPassword = initialHasPassword || passwordSetLocally;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      <div className={`flex flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between ${cardClass}`}>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{t("securityPasswordCardTitle")}</p>
          <p className="mt-1 text-muted">{t("securityPasswordCardHelp")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setPasswordOpen(true);
          }}
          className="shrink-0 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
        >
          {hasPassword ? t("securityPasswordChangeAction") : t("securityPasswordSetAction")}
        </button>
      </div>

      {message ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </p>
      ) : null}

      <PasswordChangeDialog
        open={passwordOpen}
        hasPassword={hasPassword}
        onClose={() => setPasswordOpen(false)}
        onSuccess={() => {
          setPasswordSetLocally(true);
          setPasswordOpen(false);
          setMessage(t("passwordSaved"));
        }}
      />
    </div>
  );
}
