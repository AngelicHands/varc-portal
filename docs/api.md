# VARC QSO REST API

Standalone Go service (`apps/api`) for external QSO logbook access. Uses the same MongoDB database and `.env` as the portal.

**Interactive documentation:** [https://api.hamvn.com/docs](https://api.hamvn.com/docs) (local: [http://localhost:3100/docs](http://localhost:3100/docs))

OpenAPI spec: [`apps/api/openapi.yaml`](../apps/api/openapi.yaml) (embedded in the API binary at `/openapi.yaml`).

## Local development

`pnpm dev:all` starts four processes:

| Process | URL / notes |
|---------|-------------|
| Portal | http://localhost:3099 |
| Go API | http://localhost:3100 |
| Backup worker | background |
| Email worker | background |

Run only the API:

```bash
pnpm dev:api
```

Requires [Go 1.22+](https://go.dev/dl/).

## Authentication

1. Sign in to the portal.
2. Open **Account → Security → API tokens**.
3. **Create token** and copy the secret (shown once).
4. Send requests with:

```http
Authorization: Bearer varc_…
```

Tokens are stored hashed. Revoke unused tokens from the Security tab.

## Endpoints

Base URL: `API_PUBLIC_URL` (default `http://localhost:3100`).

| Method | Path | Scope |
|--------|------|-------|
| GET | `/health` | none |
| GET | `/v1/qsos` | `qso:read` |
| POST | `/v1/qsos` | `qso:write` |
| GET | `/v1/qsos/:id` | `qso:read` |
| PATCH | `/v1/qsos/:id` | `qso:write` |
| DELETE | `/v1/qsos/:id` | `qso:write` |

### List QSOs

```bash
curl -sS -H "Authorization: Bearer $VARC_TOKEN" \
  "http://localhost:3100/v1/qsos?page=1&pageSize=100&sort=qsoAt&dir=desc"
```

Query params:

| Param | Default | Max | Notes |
|-------|---------|-----|-------|
| `page` | `1` | — | 1-based page index |
| `pageSize` | `1000` | `1000` | Items per page (never returns the full logbook in one response) |
| `q` | — | — | Search (callsign, mode, band, grid, notes) |
| `sort` | `qsoAt` | — | `qsoAt`, `workedCallsign`, `band`, `mode`, `grid` |
| `dir` | `desc` | — | `asc` or `desc` |

**Filters** (combine freely; invalid values return `400`):

| Param | Validation |
|-------|------------|
| `fromDate` | `YYYY-MM-DD` or RFC3339; year 1900–2100 |
| `toDate` | Same as `fromDate`; must be ≥ `fromDate` |
| `workedCallsign` | Valid ham callsign (normalized uppercase) |
| `band` | One of: `160m`, `80m`, `60m`, `40m`, `30m`, `20m`, `17m`, `15m`, `12m`, `10m`, `6m`, `2m`, `70cm`, `23cm`, `other` |
| `mode` | 1–32 chars: letters, digits, `/`, `+`, `.`, `-`, `_`, space |
| `source` | `portal`, `api`, `qrz`, `eqsl`, `adif` |
| `grid` | Valid Maidenhead locator (4–12 chars, even length) |
| `qso_sent` | exactly `true` or `false` |
| `qso_confirmed` | exactly `true` or `false` |

Unknown or duplicate query parameters are rejected. Empty values for a supplied filter key (e.g. `?band=`) are rejected.

Example with filters:

```bash
curl -sS -H "Authorization: Bearer $VARC_TOKEN" \
  "http://localhost:3100/v1/qsos?fromDate=2026-01-01&toDate=2026-12-31&band=20m&mode=FT8&q=ABC"
```

List response always includes `pagination` and `filters` (echo of applied filters):

```json
{
  "ok": true,
  "items": [ … ],
  "pagination": {
    "page": 1,
    "pageSize": 1000,
    "total": 2400,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  },
  "filters": {
    "search": "ABC",
    "fromDate": "2026-01-01T00:00:00Z",
    "toDate": "2026-12-31T23:59:59.999999999Z",
    "band": "20m",
    "mode": "FT8"
  },
  "sortKey": "qsoAt",
  "sortDir": "desc"
}
```

### Create QSO

```bash
curl -sS -X POST -H "Authorization: Bearer $VARC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workedCallsign": "XV1ABC",
    "qsoAt": "2026-08-22T10:00:00.000Z",
    "band": "20m",
    "freqMhz": 14.074,
    "mode": "FT8",
    "rstSent": "59",
    "rstRcvd": "59",
    "qso_sent": false,
    "grid": "OK30",
    "notes": ""
  }' \
  http://localhost:3100/v1/qsos
```

Notes:

- Your account must have a callsign set.
- API-created QSOs use `source: "api"`.
- **No confirmation emails** are sent for API create/update (portal logbook only).

## Rate limiting

Rate limits use Valkey sliding windows (fixed window via `INCR` + TTL). They apply only to **`/v1/*`** routes. `/health`, `/docs`, and `/openapi.yaml` are not rate limited.

| Layer | Default limit | Window | Valkey key | Applies to |
|-------|---------------|--------|------------|------------|
| **Per IP** | 30 requests | 1 minute | `rate:api:ip:{ip}` | All `/v1/*` requests (including failed auth) |
| **Per token (read)** | 120 requests | 1 minute | `rate:api:token:{tokenId}` | Authenticated GET (and other non-write methods) |
| **Per token (write)** | 30 requests | 1 minute | `rate:api:token:{tokenId}:write` | `POST`, `PATCH`, `DELETE` on `/v1/qsos` |

Production defaults are set in [`deploy/k8s/configmap.yaml`](../deploy/k8s/configmap.yaml). Override via environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_RATE_LIMIT` | `120` | Max authenticated requests per token per window (reads count toward this) |
| `API_RATE_LIMIT_WRITE` | `30` | Max write requests (`POST`/`PATCH`/`DELETE`) per token per window |
| `API_RATE_LIMIT_WINDOW` | `1m` | Window duration (`1m`, `30s`, Go duration syntax) |

The per-IP limit (30/min) is fixed in code and not configurable via env.

**429 response** when a limit is exceeded:

```json
{ "error": "Too many requests" }
```

**If Valkey is unavailable:**

| Limit | Behavior |
|-------|----------|
| Per IP | Fail-open (requests allowed) |
| Per token (read) | Fail-open |
| Per token (write) | Fail-closed (writes rejected) |

Set `VALKEY_URL` in production so limits and caching work as intended.

## Caching (Valkey)

The API and portal share the same Valkey instance when `VALKEY_URL` is set. This keeps logbook data consistent across both apps.

### QSO read cache

| Key pattern | TTL | Invalidated by |
|-------------|-----|----------------|
| `api:qso:list:user:{userId}:…` | 300s | Any QSO write (portal or API) |
| `api:qso:item:user:{userId}:id:{qsoId}:…` | 300s | Any QSO write for that user |

List and item cache keys register under the shared tag `qso:tag:user:{userId}`. Portal list/count keys (`qso:list:user:…`, `qso:count:user:…`) use the same tag, so **API writes immediately bust portal caches** and vice versa.

Ham public profile caches use `qso:tag:ham:{callsign}`. API create/update/delete busts both the logger callsign and the worked callsign.

### Auth token cache

After a successful Bearer verify, the API caches metadata (never the plaintext token):

| Key pattern | TTL | Invalidated by |
|-------------|-----|----------------|
| `api:auth:token:{tokenId}` | 90s (default) | Portal revoke, API restart flush |
| `api:auth:prefix:{tokenPrefix}` | 90s (default) | Portal revoke, API restart flush |

HMAC verification still runs on every request. Revoking a token in **Account → Security** deletes both cache keys immediately.

On API startup, all `api:auth:*` keys are flushed by default (`API_AUTH_CACHE_FLUSH_ON_START=true`).

### Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `VALKEY_URL` | — | Required in production for cache + rate limits |
| `API_AUTH_CACHE_TTL` | `90s` | Auth metadata cache lifetime |
| `API_AUTH_CACHE_FLUSH_ON_START` | `true` | Flush auth cache when Go API starts |

If Valkey is unavailable, the API falls back to MongoDB (fail-open for reads and auth).

## Environment

Shared with the portal (see root `.env.example`):

- `MONGODB_URI`
- `AUTH_SECRET` or `API_TOKEN_PEPPER`
- `VALKEY_URL` / `VALKEY_PASSWORD` (optional; cache invalidation + rate limits)
- `API_PORT`, `API_PUBLIC_URL`, `API_RATE_LIMIT*`

## Deployment

Kubernetes manifests:

| File | Purpose |
|------|---------|
| `deploy/k8s/deployment.yaml` | Portal web |
| `deploy/k8s/api-deployment.yaml` | Go QSO REST API |
| `deploy/k8s/api-service.yaml` | API ClusterIP (80 → 3100) |
| `deploy/k8s/backup-worker.yaml` | Backup worker |
| `deploy/k8s/email-worker.yaml` | Email worker |
| `deploy/k8s/ingress.yaml` | Portal (`hamvn.com`) + API (`api.hamvn.com`) |

Release workflow builds `ghcr.io/<owner>/varc-portal-api` on version tags. The on-demand **Deploy** workflow pins `api-deployment.yaml` to the release tag; Argo CD syncs into namespace `varc`.

Ingress host: `api.hamvn.com` → `varc-api` Service. The API pod uses the same `varc-portal-secrets` and `varc-portal-config` as the web app.
