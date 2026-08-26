# Why the system is slow to load — the measurement

**Measured 2026-08-26, cycle 4. Nothing was changed.** Queue item 2 says measure
first and report before touching a line. This is that report.

> **Cycle 5 addendum (2026-08-26).** The two tidy-ups in section 3 have since
> been done, and section 3 now records what changed. **The headline finding is
> untouched: the bottleneck is still the single Basic B1 CPU core**, and the two
> open decisions below (Always On, and moving off B1) are still Greg's and still
> the only changes that will actually make the app feel faster.

---

## The short answer

**The web server is out of CPU. The database is fine, and
`loadClientWorkspaceBundle` is not the cause.**

The app runs on a **Basic B1 App Service plan — a single CPU core**. Over the last
seven days that core hit **90% or more in 43% of all hours**, and 99% in 11 of
them. When the core is saturated, every page waits, no matter how fast its
queries were.

| Layer | Measured | Verdict |
|---|---|---|
| App Service CPU (B1, **1 core**) | **>=90% in 43% of hours**, >=50% in 99% of hours | **This is the bottleneck** |
| PostgreSQL CPU (Burstable B2s) | peak **58%**, typically under 45% | Comfortable. Not the cause |
| `loadClientWorkspaceBundle` | **19 SQL round-trips, constant**; ~10-30 ms warm | Not the cause. See below |
| Warm response (direct URL) | ~160-220 ms TTFB | Fine when the core is free |

---

## The suspect is exonerated

Queue item 2 named `loadClientWorkspaceBundle` and its "8 parallel queries" as a
suspect. It was measured directly, by instrumenting the Postgres driver and
counting every statement the loader causes.

**It costs 19 SQL round-trips, and that number does not move.**

| mailboxes on the client | SQL round-trips | wall clock (local, warm) |
|---|---|---|
| 1 | **19** | 64.7 ms (cold pool) |
| 6 | **19** | 16.1 ms |
| 20 | **19** | 9.3 ms |

Identical at 1, 6 and 20 mailboxes. **There is no N+1 here.** The parallel block
is a fixed cost, and the `Promise.all` genuinely overlaps — total time spent in
the database (~33 ms) is more than double the wall clock (~9-16 ms), which is
only possible if the queries really are running concurrently.

Two clarifications to the queue entry, both minor:

* It is **1 + 7**, not 8. `getClientByIdForStaff` runs **serially first** and the
  other seven run in parallel after it. The serial one is the widest query in the
  bundle: six nested `include`s plus four `_count` sub-selects.
* Those 19 round-trips were measured against **empty tables**. Real data adds
  execution time per query, but not more round-trips.

Reproduce it:

```
docker run -d --name odoutreach-e2e-postgres \
  -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
  -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine
npm run db:migrate:e2e
npm run test:integration -- client-workspace-bundle.perf
```

`src/server/queries/client-workspace-bundle.perf.integration.test.ts` is a
permanent ratchet: it fails if the round-trip count ever grows past 60, so a new
N+1 cannot land silently.

---

## What IS worth fixing, cheapest first

### 1. Turn Always On ON — free, one checkbox

`alwaysOn` is **false**. The app is unloaded after ~20 minutes idle, and the next
visitor pays a full Next.js cold start on one Basic core.

The two cron workflows (every 5 and 15 minutes, **weekdays, UK hours**) mask this
during the working day. Outside those hours — early morning, evenings, weekends —
the first page load is a cold start. That matches "sometimes it takes forever"
better than it matches a constant slowness.

**Always On is available on Basic B1. It costs nothing.**

### 2. Move off B1 — the real fix

One core is not enough for Next.js server rendering plus the outbound send worker
plus reply sync on the same instance. Every cron run competes with whoever is
using the app. **B1 cannot scale out** either — no autoscale on Basic.

Recommended: **S1 Standard** (still 1 core but with autoscale, staging slots and
Always On) or **P0v3/P1v3** for real headroom. A staging slot would also remove
the "Azure serves the old build for ~2 minutes after deploy" problem this repo
has recorded, because a slot swap is atomic.

**This is a cost decision, so it is Greg's, not the relay's.** It is the single
highest-impact change available and no amount of query tuning substitutes for it.

### 3. Then, and only then, look at the queries — DONE, cycle 5

Two things were worth a look once the CPU ceiling is dealt with. Both are now
done. **Neither was the cause, and neither will be noticeable on its own** —
they are recorded here as tidy-ups, not as a fix for the slowness.

One correction to the cycle-4 count first: this section said
`ClientMailboxIdentity` was queried **four** times per page load. Re-measuring
showed **five**. The undercount came from reading the grouped table (two
statements marked "runs 2x") and missing a third, single-run statement.

* **`getAccessibleClientIds` scanned the whole `Client` table** on every
  workspace page — `SELECT "id" FROM "Client" WHERE "deletedAt" IS NULL`, no
  limit — and twice per page, because the mailbox-mutation gate inside the
  bundle asked again. The list form still exists for callers that genuinely want
  every client (the clients index, cross-client reports). What changed is that
  "may this staff member touch THIS one client?" is now a new
  `canAccessClient`, a single indexed row lookup. Both build their `where` from
  one shared `accessibleClientWhere` predicate, so the tenant wall cannot drift
  between them if it is ever narrowed to `ClientMembership`.
* **`ClientMailboxIdentity` was read five times per page load**, though the
  bundle already holds `client.mailboxIdentities` from the first query. Two of
  the five re-fetched exactly those rows (`loadGovernedSendingMailbox` and
  `resolveInternalDomainsForClient`); both now take the rows the bundle holds.
  Three remain and are legitimate: the workspace query's own include, plus the
  two `mailbox` joins on the governed-send ledger and the inbox preview.

Measured before and after, same harness, same database:

| | before | after |
|---|---|---|
| SQL round-trips per workspace page | 19 | **17** |
| `ClientMailboxIdentity` reads | 5 | **3** |
| Whole-table "every live client" scans | 1 | **0** |

Still constant at 1, 6 and 20 mailboxes — there was no N+1 before and there is
none now. The perf test asserts all three numbers, so a regression fails CI
rather than being noticed later.

**One deliberate behaviour change, recorded because it is not a pure
refactor.** When a workspace has several sendable mailboxes and *none* is marked
primary, the "which mailbox is this workspace sending from?" display now picks
deterministically (primary first, then lowest email alphabetically) instead of
in whatever order Postgres happened to return rows. The send path is unaffected
— it calls `loadGovernedSendingMailbox` itself, which is unchanged.

---

## What could not be measured, and why

**Real signed-in page timings.** Sign-in is Microsoft Entra OAuth, which cannot be
completed non-interactively, so no authenticated production page was timed. The
19-round-trip figure and the CPU metrics are both real; the end-to-end
"click a tab, wait N seconds" number is not, and is not guessed at here.

**Sentry already has the answer.** `sentry.server.config.ts` sets
`tracesSampleRate: 1` with a hardcoded DSN, so **every production request is
being traced**. Sentry Performance should already show exactly which routes are
slow and where their time goes, at real data scale, for real signed-in users.
Nobody appears to have looked. That is the cheapest next step and it needs Greg's
Sentry login.

---

## A seventh instance of the defect class — a small one

`QUEUE.md` says: *"Assume the seventh exists."*

**Application Insights is provisioned and has never received a single event.** The
resource `app-opensdoors-outreach-prod` (`microsoft.insights/components`) was
created **2026-04-16**. Four months later:

```
requests | where timestamp > ago(90d) | count   ->  0
traces   | where timestamp > ago(90d) | count   ->  0
union *  | count                                ->  0
```

There is no `APPLICATIONINSIGHTS_CONNECTION_STRING` or
`APPINSIGHTS_INSTRUMENTATIONKEY` in the App Service configuration, so nothing was
ever pointed at it. It sits in the resource group looking like monitoring.

**It is a mild case**, and the honest framing matters: Sentry *is* wired and
covers the same ground, so this is a redundant resource rather than a blind spot.
Either connect it or delete it, so nobody mistakes it for coverage.

While checking this, one of my own inferences was wrong and is corrected here:
the absence of a `SENTRY_DSN` app setting does **not** mean Sentry is off. The DSN
is hardcoded in `sentry.server.config.ts`. Sentry is live.

---

## Open questions for Greg

1. **Turn Always On on?** Free, one checkbox, no downtime. Recommended yes.
2. **Move off B1?** A cost decision and the highest-impact one available.
3. **Connect or delete the empty Application Insights resource?**
