---
name: Disable X-Powered-By
overview: "Stop Next.js from emitting the `X-Powered-By` response header by setting `poweredByHeader: false` in `next.config.ts`."
todos:
  - id: disable-powered-by
    content: "Set poweredByHeader: false in next.config.ts"
    status: completed
isProject: false
---

# Disable X-Powered-By header

## Cause

Next.js adds `X-Powered-By: Next.js` on responses by default. This app does not currently disable it in [`next.config.ts`](next.config.ts).

Ingress cannot strip it with a config snippet: [`deploy/k8s/ingress.yaml`](deploy/k8s/ingress.yaml) notes the cluster disables ingress snippets, so the reliable fix is at the app layer.

## Change

In [`next.config.ts`](next.config.ts), add:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // ...existing redirects/rewrites
};
```

That removes the header for all Next.js responses (pages, API routes, rewrites such as `/media/*`).

## Deploy note

This is a build-time Next config flag. Redeploy the app image after the change for production to pick it up (`next build` / new pod). No ingress change needed unless a different upstream (e.g. NPM/Cloudflare) is also injecting its own `X-Powered-By`.
