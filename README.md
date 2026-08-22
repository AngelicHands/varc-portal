# VARC Portal

Cổng thông tin của Hiệp hội Vô tuyến Nghiệp dư Việt Nam / Vietnam Amateur Radio Club CMS.

## Stack

- Next.js App Router (TypeScript, Tailwind v4)
- MongoDB + Mongoose
- Auth.js (email/password + optional Google)
- next-intl (`vi` default, `en` under `/en`)

## Quick start (local)

1. Copy env and start Mongo:

```bash
cp .env.example .env
docker compose up -d mongo
```

Mongo is published on host port **27027** (avoids clashing with other local Mongo instances).

2. Install and seed admin:

```bash
pnpm install
pnpm seed
pnpm dev
```

3. Open:

- Portal: http://localhost:3099
- English: http://localhost:3099/en
- Admin: http://localhost:3099/admin/login

Default seed credentials come from `.env` (`INITIAL_ADMIN_*`).

## Media uploads

Admin media uploads (Media gallery, article cover/OG, TipTap body images, pasted/dropped files, site logo/favicon) go through `POST /api/media`. Editors and admins can manage the library at `/admin/media` (multi-file image/video upload, trash).

### Local disk (default)

```bash
STORAGE_DRIVER=local
UPLOAD_DIR=./uploads
```

Files are stored under `uploads/` and served at `/media/...` (rewritten to `/api/media/...`).

By default, the media endpoint accepts common images and videos (`mp4`, `webm`, `mov`) plus `pdf`, `txt`, `zip`, `doc/docx`, `xls/xlsx`, and `ppt/pptx` (max 50MB). Override with `MEDIA_ALLOWED_MIME` / `MEDIA_MAX_BYTES` if needed.

### MinIO / S3

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=varc-portal-media
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_URL=http://localhost:9000/varc-portal-media
```

Quick MinIO:

```bash
docker run -d --name varc-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Create a public-read bucket named `varc-portal-media` in the console at http://localhost:9001.

Production should use `STORAGE_DRIVER=s3` (see `deploy/k8s/configmap.yaml` + S3 keys in the secret). Prefer MinIO over a PVC so portal pods stay ephemeral.

## Google login

Optional. Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (or Auth.js aliases `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`). The Google button appears on `/admin/login` when configured. New Google users get role `user`. A `system_admin` grants `administrator` under **Admin → Users**. Role changes apply on the next sign-in.

## Form confirmation email (Cloudflare)

When a public form is submitted, the portal can email a thank-you note plus a copy of the answers to the requestor (first field with type `email`).

```bash
CF_MAIL_API_TOKEN=your-cloudflare-api-token   # Email Sending: Edit
CF_MAIL_ACCOUNT_ID=your-cloudflare-account-id
CF_MAIL_FROM=noreply@yourdomain.com          # domain must be onboarded for Email Sending
```

Optional rate limits (require `VALKEY_URL`):

```bash
CF_MAIL_MAX=500                  # max sends per rolling 24h for the whole app
CF_MAIL_RATE_LIMIT=5             # max sends per client IP per window
CF_MAIL_RATE_LIMIT_WINDOW=1h     # window: 30s, 5m, 1h, 1d, etc.
```

Uses the Cloudflare Email Sending REST API (`POST /accounts/{account_id}/email/sending/send`). If any mail variable is unset, submissions still succeed and no mail is sent. Add secrets to the Kubernetes secret (see `deploy/docs/secret.example.yaml`); rate-limit keys can go in the ConfigMap.

## Admin backup and restore

Site managers can use **Admin → Backup** to queue a background backup or restore job.

- **Backup** creates a ZIP with MongoDB collections plus managed media/form-upload files
- the finished ZIP is stored as an artifact and emailed to the admin who started the job
- **Restore** can start from either an uploaded ZIP or a remote HTTPS URL
- restore replaces current CMS content, users, callsigns, and managed files
- Valkey is **not** included; cache is rebuilt after restore

Backup artifacts use local disk (`BACKUP_ARTIFACT_DIR`) in local development or S3-compatible object storage (`BACKUP_S3_BUCKET` / `BACKUP_S3_PREFIX`) when `STORAGE_DRIVER=s3`.

To run both the app and the local backup worker together during development:

```bash
pnpm dev:all
```

That starts `next dev` on port `3099` and the compiled Node.js backup worker in the same terminal session.

## Docker Compose (app + Mongo)

```bash
cp .env.example .env
# set NEXTAUTH_SECRET / INITIAL_ADMIN_*
docker compose up -d mongo
pnpm seed
docker compose up --build web
```

## Kubernetes / Argo CD

Manifests for Argo CD live in `deploy/k8s/` (web Deployment, backup-worker Deployment, email-worker Deployment, Service, Ingress, ConfigMap, Valkey). App secrets are **not** synced by Argo — create them once in the cluster.

Valkey (`deploy/k8s/valkey.yaml`) is a single in-cluster cache (`VALKEY_URL=redis://valkey:6379` in the ConfigMap). It requires `VALKEY_PASSWORD` in `varc-portal-secrets` (`--requirepass`, probes use `REDISCLI_AUTH`). It is not on the Ingress; data is ephemeral (LRU, no AOF).

Public CMS reads (branding, menus, pages, articles, categories, templates) use cache-aside with tag invalidation on every admin save. If `VALKEY_URL` is unset or Valkey is down, the app falls back to Mongo. Locally you can run Valkey with a password and set `VALKEY_URL` + `VALKEY_PASSWORD` (see `.env.example`).

The backup worker runs as a separate deployment (`deploy/k8s/backup-worker.yaml`). The email queue worker runs as `deploy/k8s/email-worker.yaml` (same GHCR worker image, different command). Do not rely on the web pod’s `instrumentation.ts` for mail — standalone production builds do not start it. Uploaded restore ZIPs rely on a larger ingress body limit (`512m` by default), while remote-link restore avoids that upload limit.

### One-time bootstrap

```bash
kubectl create namespace varc

# App + GHCR + (optional) Argo repo secrets — see comments in the example file
cp deploy/docs/secret.example.yaml /tmp/varc-secrets.yaml
# edit /tmp/varc-secrets.yaml  (or create ghcr-pull via kubectl as documented there)
kubectl apply -f /tmp/varc-secrets.yaml

kubectl apply -f deploy/argocd/application.yaml
```

Argo CD watches `deploy/k8s` on this repo and syncs into namespace `varc`.

### Release (build only — does not deploy)

Bump version, commit, then push a `v*` tag. The [Release](.github/workflows/release.yml) workflow:

- Lints and builds the app
- Publishes a GitHub Release (notes + standalone tarball)
- Pushes container images to GHCR:
  - `ghcr.io/<owner>/varc-portal:vX.Y.Z` (web)
  - `ghcr.io/<owner>/varc-portal-backup-worker:vX.Y.Z` (backup + email workers; same image)

```bash
VERSION=1.0.26
./scripts/bump-version.sh $VERSION
git push origin HEAD
git tag v$VERSION
git push origin v$VERSION
```

The tagged commit must contain matching `VERSION` / `package.json` values.

### On-demand deploy

Deploy is **not** triggered by tags. After a release exists:

1. GitHub → **Actions** → **Deploy** → **Run workflow**
2. Enter the version (e.g. `1.0.26` or `v1.0.26`)
3. The workflow verifies the GitHub Release + GHCR images, pins these manifests to `vX.Y.Z`, and pushes a `chore: deploy v…` commit:
   - `deploy/k8s/deployment.yaml` → web image
   - `deploy/k8s/backup-worker.yaml` → worker image
   - `deploy/k8s/email-worker.yaml` → worker image (same tag; different command)
4. Argo CD syncs the new images from Git

## Content model

Articles and pages store bilingual fields. Body content is **HTML** from the TipTap rich text editor. Public views sanitize HTML before render. Publishing requires Vietnamese title and content; English is optional.

Article, category, and page slugs are generated automatically from the title/name.

## Routes

| Path | Description |
|------|-------------|
| `/` | Latest news (VI) |
| `/en` | Latest news (EN) |
| `/qso` | QSO map (logged-in station, or look up a public logbook) |
| `/{callsign}?view=map` | Public ham QSO map |
| `/account?view=map` | Owner QSO map when the account has no callsign yet |
| `/tin-tuc/[slug]` | Article (VI) |
| `/en/news/[slug]` | Article (EN) |
| `/trang/[slug]` | CMS page (VI) |
| `/en/pages/[slug]` | CMS page (EN) |
| `/admin` | CMS dashboard |
| `/admin/articles` | Manage articles |
| `/admin/categories` | Manage categories |
| `/admin/media` | Media gallery (images & videos) |
| `/admin/pages` | Manage pages |
| `/admin/users` | Manage users / roles |
| `/api/health` | Health check |
| `/api/media` | Admin image upload (`POST`) |
| `/media/...` | Local uploaded media (`GET`) |

## Releases

See [Kubernetes / Argo CD](#kubernetes--argo-cd) for the full release and on-demand deploy flow.

Quick release:

```bash
VERSION=1.0.26
./scripts/bump-version.sh $VERSION
git push origin HEAD
git tag v$VERSION
git push origin v$VERSION
```

###### Updated