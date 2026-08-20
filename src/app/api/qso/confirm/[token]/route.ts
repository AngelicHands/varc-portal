import { NextResponse } from "next/server";
import { confirmQsoByToken } from "@/lib/qso-confirmation";
import { routing } from "@/i18n/routing";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { token } = await params;
  const result = await confirmQsoByToken(token);
  const locale = routing.defaultLocale;
  const status = result.ok
    ? "success"
    : result.error === "already_confirmed"
      ? "already"
      : result.error === "expired"
        ? "expired"
        : "invalid";

  return NextResponse.redirect(
    new URL(`/${locale}/qso/confirmed?status=${status}`, _request.url),
  );
}
