---
name: Valkey API Performance
overview: The Go API uses Valkey only for rate limiting and write-side cache invalidation today. Add QSO read cache-aside and verified auth metadata cache (never plaintext tokens) to speed repeated API traffic.
todos:
  - id: qso-list-cache-aside
    content: Add apps/api/internal/cache/qso_cache.go with QsoListAside (key+tag+TTL 300s) and wire into Service.List
    status: pending
  - id: service-valkey-inject
    content: Inject *cache.Valkey into qso.Service; update main.go and handler wiring
    status: pending
  - id: filter-hash-key
    content: Build filterHash from ListFilters+pagination+sort for stable cache keys
    status: pending
  - id: qso-get-cache
    content: "Optional: cache GET /v1/qsos/:id with api:qso:item key under user tag"
    status: pending
  - id: auth-token-cache
    content: Cache verified auth metadata in Valkey; HMAC every request; portal revoke hooks delete keys
    status: pending
  - id: auth-cache-flush-on-start
    content: Go API startup flushes api:auth:* so restarts never serve stale token metadata
    status: pending
  - id: portal-token-lifecycle
    content: Wire invalidateApiAuthCache in revokeApiTokenAction via src/lib/cache/api-auth-cache.ts
    status: pending
  - id: qso-write-invalidation
    content: API POST/PATCH/DELETE bust shared qso:tag:user + ham tags; logger + worked callsign on update
    status: pending
  - id: docs-cache-contract
    content: Document shared tag contract, write invalidation, restart flush, VALKEY_URL in docs/api.md
    status: pending
isProject: false
---

# Valkey performance plan for Go QSO API

See full plan at `~/.cursor/plans/valkey_api_performance_8249a000.plan.md`.

## Auth cache lifecycle (user requirement)

- **Never** store plaintext Bearer in Valkey — only verified metadata (`tokenHash`, `userId`, `scopes`, `expiresAt`, `revokedAt`).
- **Revoke/update token (portal):** after Mongo write → `DEL api:auth:token:{id}` + `DEL api:auth:prefix:{prefix}`.
- **Create token:** no Valkey write (first API call populates cache).
- **Go API restart:** flush all `api:auth:*` on startup (`API_AUTH_CACHE_FLUSH_ON_START=true` default).
- **Every request:** HMAC verify + reject cached entry if `revokedAt` or expired.

- **QSO via API → portal consistent:** API writes already call `InvalidateQsoAndHamCache`; new `api:qso:*` read keys must use same `qso:tag:user:{userId}` tag. Harden handler to also bust worked callsign ham cache on create/update/delete.
