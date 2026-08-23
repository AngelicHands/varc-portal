const HEADER = "authorization";

export function resolveWorkerInternalSecret(): string {
  return (
    process.env.WORKER_INTERNAL_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    ""
  );
}

export function isWorkerInternalAuthorized(request: Request): boolean {
  const secret = resolveWorkerInternalSecret();
  if (!secret) return false;

  const header = request.headers.get(HEADER)?.trim() ?? "";
  if (header === `Bearer ${secret}`) return true;

  const legacy = request.headers.get("x-worker-secret")?.trim() ?? "";
  return legacy === secret;
}
