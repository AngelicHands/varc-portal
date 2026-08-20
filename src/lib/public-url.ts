export function getPublicBaseUrl(): string {
  return (
    process.env.AUTH_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3099"
  );
}
