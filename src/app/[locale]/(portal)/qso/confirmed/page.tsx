import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "logbook" });
  return { title: t("confirmPageTitle") };
}

export default async function QsoConfirmedPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  setRequestLocale(locale);

  const { status = "invalid" } = await searchParams;
  const t = await getTranslations("logbook");

  const messageKey =
    status === "success"
      ? "confirmSuccess"
      : status === "already"
        ? "confirmAlready"
        : status === "expired"
          ? "confirmExpired"
          : "confirmInvalid";

  const isSuccess = status === "success" || status === "already";

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center px-4 py-14 text-center md:px-6">
      <div
        className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
          isSuccess ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}
        aria-hidden
      >
        {isSuccess ? (
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        )}
      </div>
      <h1 className="font-display text-3xl text-foreground">{t("confirmPageTitle")}</h1>
      <p className="mt-4 text-muted">{t(messageKey)}</p>
      <Link
        href="/logbook"
        className="mt-8 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        {t("openLogbook")}
      </Link>
    </div>
  );
}
