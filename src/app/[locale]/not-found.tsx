import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFoundPage() {
  const t = await getTranslations("notFound");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-12 text-center md:px-6">
      <p className="text-sm font-medium uppercase tracking-wider text-muted">
        404
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-md text-base text-muted">{t("description")}</p>
      <Link
        href="/"
        className="mt-8 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
      >
        {t("backHome")}
      </Link>
    </div>
  );
}
