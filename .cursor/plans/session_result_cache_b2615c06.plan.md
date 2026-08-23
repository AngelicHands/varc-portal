---
name: Session result cache
overview: Caching admin session results in Redis is probably not worth it. The attempt snapshot already lives on the Mongo session document, so a Redis copy would duplicate a large payload for a rarely repeated click, with extra invalidation risk.
todos:
  - id: keep-uncached
    content: Do not add Redis for session results unless profiling shows a real bottleneck
    status: pending
isProject: false
---

# Session result caching: recommendation

**Recommendation: do not add Redis for session results.** Keep the current Mongo read on each admin click.

## What happens today

Admin click → `GET /api/content/sessions/{id}/result` → [`GetSessionResult`](backend/internal/quiz/session_results.go):

1. `FindOne` the **session** in Mongo (answers + `question_snapshot` are already on that document)
2. `FindOne` the **exam** in Mongo (title, passing score) via [`getExamRecord`](backend/internal/quiz/exams.go) — this path does **not** use the exam Redis DTO
3. Walk the snapshot in memory and attach selected / fill-in / correctness

Redis **does** cache exam-scoped **session list pages** (2 min TTL, small rows, no snapshots). It does **not** cache answer snapshots. That split is already documented in [`backend/internal/cache/cache.go`](backend/internal/cache/cache.go) (`session snapshots are not cached`).

```mermaid
flowchart LR
  click[Admin opens result]
  click --> mongoS[Mongo session plus snapshot]
  click --> mongoE[Mongo exam meta]
  mongoS --> build[Build SessionResult JSON]
  mongoE --> build
  build --> ui[Result modal]
```

The snapshot on the session **is** the cache of “what the learner saw.” Redis would be a second copy of the same HTML-heavy payload.

## Why Redis is a weak fit here

| Factor | Session **lists** (already cached) | Session **results** |
|---|---|---|
| Size | Small rows | Full prompts, options, explanations, images URLs |
| Hit pattern | Pagination / exam detail, many reads | One click per investigation; rarely the same session twice in 2 minutes |
| Mutability | Status changes often | After **completed**, answers are frozen |
| Cost of miss | Extra list query | One session `FindOne` that already includes the snapshot |

Extra Redis work would also need:

- Separate keys for admin (unmasked) vs learner (may mask correct answers)
- Invalidation on reset, delete, result-mail claim, exam title/passing edits (or accept stale labels)
- Admin cache purge already wiping `sessions:*`

That is more moving parts than the two Mongo reads you pay today.

## When caching *would* help

Only if you later see real pain: many admins opening the **same** large completed session repeatedly, or profiling showing `buildSessionResult` as hot. Even then, prefer a **long TTL on completed-only admin JSON** (`sessions:result:{id}`), not the short 2-minute list TTL — and still fail-open.

A smaller win than result caching: reuse the existing **exam-by-id Redis DTO** inside `getExamRecord` for title/passing only. That saves a tiny exam `FindOne`, not the heavy snapshot. Optional and unrelated to the modal.

## Decision

**Leave results uncached.** No Redis keys, no invalidation, no size/staleness issues. Mongo session + snapshot remains the source of truth.

If you disagree and still want Redis, say so and the follow-up is a completed-only admin key with invalidate-on-reset/delete and a test that a second `GetSessionResult` hits Redis.
