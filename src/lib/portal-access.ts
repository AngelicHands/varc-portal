import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { routing, type AppLocale } from "@/i18n/routing";

export async function requirePortalSession(locale?: AppLocale) {
  const session = await auth();
  const userId = session?.user?.id?.trim() ?? "";
  const email = session?.user?.email?.trim() ?? "";
  if (!userId && !email) {
    const appLocale = locale ?? routing.defaultLocale;
    redirect(
      `/admin/login?callbackUrl=${encodeURIComponent(`/${appLocale}/account`)}`,
    );
  }
  if (!session?.user) {
    const appLocale = locale ?? routing.defaultLocale;
    redirect(
      `/admin/login?callbackUrl=${encodeURIComponent(`/${appLocale}/account`)}`,
    );
  }
  return session;
}
