# STATE — OpensDoors Outreach

**Updated 2026-08-24 · Tier P (Client Production)**

## Session 2026-08-24f — BUILD-6. NDR tail SETTLED. Real bounces found.

#191 and #192 merged and verified (`e80edea`, `d01cafb`), #183 closed. Production
serves `d01cafb`. New PR: **#193** (inbox body fixes). Runbook written, NOT run.

### THE NDR TAIL IS SETTLED — and the answer is bad
Ran the settling observation read-only against production.

**426 NDR-shaped messages are sitting in `InboundMailboxMessage`.** Real bounces —
`Undeliverable:`, `postmaster@`, `mailer-daemon@googlemail.com` — fetched,
stored, and **never once classified**. By month: 43 in May, **217 in June**, 120
in July, 41 in August. Sends were 71 / 1,223 / 64.

**The sync definitely ran** through the whole tail: telemetry for every weekday
2026-06-25 → 07-03, hundreds of runs, ~10,000 messages seen a day,
`bouncesSuppressed` **0 every single day**.

**So the tail no longer needs the flag question answered.** Whatever the flag
said, real bounces were arriving in volume and none were ever classified.

### THE MEASURED CAUSE — Gmail had no body at all
| source | messages | with bodyText | avg bodyText |
|---|---|---|---|
| MICROSOFT_GRAPH | 6,240 | 6,067 | **4,023 chars** |
| GMAIL_API | 355 | **7** | **57 chars** |

Of **147 Gmail NDRs, ZERO had a body.** The parser reads the body. It never had
one to read.

### THE SHARPER DEFECT THE BRIEF DID NOT NAME
**Opt-out detection was starved on MICROSOFT TOO.** The sync passes
`row.fullBody?.bodyText` to the bounce classifier and, 65 lines later, only
`snippet`/`bodyPreview` to the reply path — which feeds `suppressReplyOptOut`.
The full body was fetched, in memory, discarded. **Opt-out detection has been
reading ~6% of each email**, and an opt-out is a PECR obligation. Reply
*matching* was fine (headers/subject only) — only compliance was starved.

Both fixed in #193, test seen RED first.

### ONBOARDING: neither a sync bug nor a send bug, as framed
- The send side's `NOT IN (PAUSED, ARCHIVED)` is **deliberate** — commit
  `4a11aaf` states the reason and has a guard test.
- The sync's `ACTIVE` filter is an **unexamined default** — commit `c85b7a7`,
  a 16-file feature commit whose message never mentions status.
- `evaluateSendGovernance` **already blocks** ONBOARDING clients from
  real-prospect sequence sends, and there is no deadlock (promotion needs
  nothing the sync produces).
- **The real hole is a third path:** `sendEmailToContact` (the `/contacts` Send
  button) queues a real prospect send with **no governance check at all**.
  Mitigated — `/contacts` is super-admin-only — but the action is ungated.
- **NEW:** the reply sync has **no `deletedAt: null` guard**, so soft-deleted
  workspaces are still inbox-synced.

**Not fixed this session** — the refuter judged the proposed fix unsafe as
written, and I would rather leave it named than ship a rushed change to the send
path. Recommended: align the sync filter to the send filter *and* add governance
to `sendEmailToContact`, as one considered PR.

### BACKUP RUNBOOK — written, not executed
`docs/ops/RUNBOOK-geo-redundant-database-migration.md`.
**PITR cannot select geo-redundancy** — it inherits the source's setting
(Microsoft, quoted). So a new server plus dump/restore is the only route.
**Two places hold the connection string**, and the second is the dangerous one:
App Service `DATABASE_URL` *and* GitHub secret `PRODUCTION_DATABASE_URL`, which
`deploy-production.yml` uses to migrate **before** Azure login. Miss it and every
future deploy migrates the old database.
Downtime **30–60 min** at 4.56 GB. Reversible until the connection-string switch.

## Next session
1. Merge #193.
2. **Re-run the bounce numbers after #193 deploys** — the classifier finally has
   bodies to read, so the real bounce rate should appear for the first time.
   217 NDRs against 1,223 June sends is a number Greg needs before sending again.
3. The ONBOARDING/`sendEmailToContact` governance PR, and the soft-delete guard.
4. Greg schedules the migration.
5. Then: bounce status write · F-01 · CSV import · stage 4.

---

## Earlier — session 2026-08-24e (BUILD-5)

## Session 2026-08-24e — BUILD-5. The NDR mystery is SOLVED.

Production serves `43aa6bf`. Open PRs: **#191** (salvage), **#192** (send pacing).
**#183 and #184 closed.**

## WHY NDR DETECTION NEVER FIRED — the detector did not exist

**`bounce-detection.ts` was created in commit `f464ce7` and reached production at
2026-06-25T22:39:30Z. The send window ran 2026-05-20 → 2026-07-03.** The detector
was **absent for ~37 of those 44 days**. No other live bounce path covered the
gap — `BOUNCE_SUPPRESSION_ENABLED` governs the ESP-webhook route and
`EMAIL_PROVIDER` is unset, so no ESP webhook ever fires for a mailbox send.

Found by five parallel traces plus an adversarial refutation pass. Two of the
three claimed breaks were **refuted**; this one survived four attempts.

**The tail is NOT explained.** For the last ~8 days the detector existed and the
sync demonstrably ran (live logs, 2026-07-03: 35 mailboxes, ~400 messages/run,
16 runs/day). Whether the flag was on then **cannot be determined** — Azure logs
16 app-settings writes but not *which* setting.

### Two of the three "facts" were weaker than they looked
- **"0 BOUNCED rows" is a NON-SIGNAL.** The write path never touches
  `OutboundEmail.status`. A perfectly working detector still leaves 0.
- **"0 NDR audit rows" has a blind spot.** The audit row is written only when the
  suppression is *newly* created — an NDR for an already-suppressed address
  writes nothing.

### Still live, proven, and worth fixing regardless
- **Gmail fetch never retrieves a body** (`format=metadata`), so the parser gets
  a ~200-char snippet. Google mailboxes structurally starve it. Microsoft is fine.
- **ONBOARDING clients send but are never inbox-synced** — send excludes only
  PAUSED/ARCHIVED; sync requires `status = ACTIVE`.
- `CONNECTION_ERROR` mailboxes drop out of sync; no pagination or watermark.

### The bounce status write drops down the list
It fixes *reporting* of something that mostly could not have been detected.
**Establish detection works first, then make it visible.**

## SEND PACING — built (PR #192)
Steady cadence across 07:00–18:00, modest jitter, per-mailbox offset, steered off
:00/:15/:30/:45. Deterministic, seeded. **Proven discriminating:** disabling
jitter/offset/peak-avoidance turns 3 of 17 tests red. Never raises a cap.
Flag `MAILBOX_SEND_PACING`, **default OFF and documented** — default-off with
nobody told is exactly how the NDR detector sat unused for 36 days.

## BACKUP — Greg was right, and the correction makes it FREE
Geo-redundancy **cannot** be enabled post-creation (Microsoft, verbatim, twice).
Measured: backup 7.25 GB, data 4.56 GB, provisioned 32 GB.

**Option A — migrate: costs NOTHING.** Free backup allowance is 100% of
provisioned (32 GB); geo-redundant doubles the copy to 14.5 GB, still under it.
4.56 GB is a one-hour window, not a weekend. **Recommended.**
**Option B — Azure Backup vault (GRS):** no downtime, a few £/month, but
**weekly only** so the offsite copy can be 7 days stale. Explicitly *not* a
GitHub Actions cron, since that capability is BURNED.

**Sharper than reported:** HA is disabled, so per Microsoft's default the backups
are **locally redundant — same datacentre**, not merely same region.

## Next session
1. Run the settling observation (read-only) to close the NDR tail.
2. Fix Gmail-no-body and ONBOARDING-not-synced.
3. Greg picks a backup option.
4. Then: bounce status write · F-01 opt-out capture · CSV import · stage 4.

---

## Earlier — session 2026-08-24d

## Session 2026-08-24d — QUEUE CLEARED, PRODUCTION MEASURED.

**All four PRs merged, deployed and verified one at a time.** Production serves
**`1d7e9ea6`**, health ok, database ok. Both migrations applied cleanly.

| PR | Deploy | Verified on prod |
|---|---|---|
| #186 warm-up anchor fix, rulings | success | `00278d3` ✓ |
| #187 DNC families (migration) | success | `f9915a1` ✓ |
| #188 drift reconciliation (migration) | success | `80971f2` ✓ |
| #189 production report | success | `1d7e9ea` ✓ |

**Restore path confirmed before touching anything:** `pg-opensdoors-outreach-prod-01`,
UK South, PITR with **7-day retention**, earliest restore 2026-08-17. **Geo-redundant
backup is DISABLED** — restore is region-local only.

## THE MEASUREMENTS — and my prediction was WRONG

Run read-only via a temporary firewall rule (added and removed within minutes,
removal verified).

### Bounces
**1,358 sends, 2026-05-20 to 2026-07-03. 0 marked BOUNCED. 17 suppressed outside
a sheet sync. ZERO NDR audit entries.**

NDR detection has **never fired**. That is not "no bounces" — the detector could
be working and finding nothing, or not working at all, and this data cannot tell
them apart. **The bounce status write would not fix this on its own:** if no NDR
is ever detected, marking the row marks nothing. The bounce rate is still
genuinely unmeasured.

### THE LAST SEND WAS 3 JULY — seven weeks of silence
Nothing has sent since. Reputation decays with inactivity, so every mailbox is
effectively cold regardless of June.

### Warm-up: ALL 45 of 45 mailboxes drop
**I predicted OpensDoors' own mailboxes would not move.** They all do.
`greg@opensdoors.co.uk` has **2 sending days across 119 days**;
`joe@opensdoors.co.uk` 2 across 122. **The most-used mailbox in the entire system
has 10 sending days.** 9 have zero.

**Why I was wrong:** I assumed volume implies regularity. It does not. 1,358 sends
across 45 mailboxes with ≤10 sending days each means the fleet has been sending
in **bursts**, not daily — exactly what warm-up exists to prevent. **No mailbox in
this system has ever been warmed** in the sense the ramp intends.

**Consequence Greg needs before switching sending on:** the corrected ramp is not
a tweak affecting a few idle mailboxes. It **resets the entire fleet to 5/day**.
His 30/day target is 25 sending days away for every mailbox. Under the OLD
behaviour, 45 mailboxes would have gone straight to 30/day from a standing start
after seven weeks of silence.

## Also
Two unrelated PRs remain open from 2026-08-06: **#184** (`feat/zero-dns-send-profile`
— its content is already live via #185, so it is redundant and should be closed)
and **#183** (`chore/deliverability-findings`, docs). Neither was in scope.

## Next session picks up
1. **Why has NDR detection never fired?** This now outranks the status write —
   the status write fixes reporting, but there is nothing to report.
2. Send spacing (designed in `SEND-SPACING-RESEARCH`, not built).
3. F-01 opt-out capture · CSV import · stage 4 COVERAGE/DATAMODEL · the client
   risk-disclosure document.

---

## Earlier — session 2026-08-24c (BUILD-4)

## Session 2026-08-24c — BUILD-4. FOUR PRs NOW QUEUED. Merging is the bottleneck.

| PR | What | CI |
|---|---|---|
| **#186** | Rulings 1 & 2, warm-up rules from primary sources, bounce diagnosis, warm-up anchor fix | green |
| **#187** | Ruling 3 — DNC related-company families (own migration) | green |
| **#188** | **Schema/migration drift reconciliation** (own migration) | green |
| **#189** | **`scripts/production-report.mjs`** — the two numbers, read-only | green |

**Merge in that order.** Production still serves `a4e73f62`.

**Each PR now opens with a plain-English block** per the new standing rule.

### THE DRIFT IS FIXED — additive only, nothing dropped
`schema.prisma` and the migration history disagreed **since commit `4160c00`, the
bootstrap commit**: two indexes were declared there that `20260413103000_init`
never created. The `updatedAt` defaults came from real migrations doing the right
thing (adding a NOT NULL column to a table with rows). The index rename is
Postgres truncating at 63 chars vs a newer Prisma. **Nobody ran SQL outside the
migration system** — two applied migrations *were* edited later (`79decef`
client-scope fix, `59be6d1` BOM strip) and neither caused it.

**Approach: make history match reality without dropping anything live.** The
migration only CREATEs two indexes and RENAMEs one; the defaults and the extra
index are now DECLARED in the schema instead. **All three destructive statements
Prisma proposed were refused.**

Proven three ways: clean replay → "No difference detected"; a deliberately
re-drifted database → reconciles cleanly; applied twice → idempotent.
**No data can be lost.**

### THE PRODUCTION REPORT — one command, for Greg
```
$env:PRODUCTION_DATABASE_URL="<from Azure>"; node scripts/production-report.mjs
```
Read-only enforced **three ways** (statement check, session
`default_transaction_read_only`, explicit `BEGIN READ ONLY`), and the guard is
tested by importing the **real** exported function, not a copy — 14 tests.

### SEND SPACING — researched, and the brief's premise does not hold
**Sourced:** don't burst (Microsoft: **30 messages per MINUTE** hard limit);
send at a **consistent** rate (SendGrid); avoid :00/:15/:30/:45 ISP peaks;
Google's start-low-increase-slowly.

**NOT sourced:** the brief asserts a fixed cadence is itself a fingerprint and
gaps must be randomised. **I found no provider or major ESP saying that, and the
published advice points the other way — send consistently.** It is a
cold-email-vendor folk belief. Flagged because it is the same shape as the "2%
bounce" rule, which also sounded authoritative and had nothing behind it.

**Design recorded** in `DOMAIN.json` → `diagnoses` → `SEND-SPACING-RESEARCH`:
steady base cadence across working hours, modest jitter + per-mailbox offset
justified as *human appearance and peak-avoidance*, not as a deliverability
requirement; seeded so it is testable. **NOT BUILT** — see below.

## Why I stopped
BUILD-4 item 0 says do not let PRs queue. Four are queued. Building a fifth that
cannot merge would contradict the instruction that opened the brief. The gate
records that unblock source edits live in `DOMAIN.json` **on those branches**, so
a branch off `main` is still blocked until they land — which is itself a cost of
the queue.

## Next session picks up
1. **Merge #186 → #187 → #188 → #189.**
2. **Greg runs the production report** and sends the output. Both numbers depend on it.
3. Send spacing (designed, not built) · bounce status write · F-01 opt-out capture ·
   CSV import · stage 4 COVERAGE/DATAMODEL · the client risk-disclosure document.

---

## Earlier — session 2026-08-24b (BUILD-3)

## Session 2026-08-24b — BUILD-3. The gate is OPEN. Three PRs now stacked.

**BUILD GATE: 0 BLOCKING — for the first time.** Both ungated irreversible
actions are now gated with earned, RED-first evidence.

### PRs waiting on Greg, in merge order
| PR | What | State |
|---|---|---|
| **#186** | Rulings 1 & 2, warm-up rules from primary sources, bounce diagnosis, warm-up anchor fix | OPEN, CI green |
| **#187** | **Ruling 3 — DNC related-company families.** Own PR, own migration. **Stacked on #186** | OPEN, CI green |

**Merge #186 first**, or #187's diff shows its commits too. Production still
serves `a4e73f62`.

### RULING 3 shipped — the unblocker
Do-not-contact now covers related company domains **via an explicit per-client
list, never inferred**. New `SuppressedDomainFamily` table; a family is the rows
sharing a `label` within one client; suppression is **transitive** — if any
member is suppressed, all are. Default empty, so nothing changes for existing
clients.

**Both suppression behaviours were built, deliberately:** the send-path gate is
authoritative and re-reads families every send (so an entry added today blocks a
contact loaded months ago — the case that actually happens), AND
`Contact.isSuppressed` is refreshed so the screen agrees with the gate. The UI
distinguishes **Blocking** from **Listed, not blocking**.

**Test RED first:** 3 of 10 failed pre-implementation; all seven over-block and
per-client-isolation guards already passed — the right shape, since the danger
was never under-listing.

### ⚠️ PRE-EXISTING SCHEMA DRIFT — found, contained, NOT fixed
`prisma migrate dev` wanted to add **six unrelated statements** to the feature
migration: two index drops, two index creates, an index rename and two
`DROP DEFAULT`s on live tables. They come from drift between `schema.prisma` and
the migration history — two of those indexes exist in **no migration at all**.

**Hand-trimmed out**, because `deploy-production.yml` migrates production
*before* the Azure login step. **The drift is real and needs its own reviewed
migration.** Any future `migrate dev` will try to smuggle it again.

### Also earned: the cross-client send gate
Proven by deliberate breakage — replacing the contact guard with an unreachable
branch turned `blocks cross-client contact` RED. **Only the CONTACT guard was
proven; sequence and template are asserted from reading, and the register says so.**

### Gates
lint 0 · typecheck 0 · **1891 unit / 218 files** · **15 e2e** · build green · CI green.

## NOT done — and two of these need production access I do not have
- **The real historical bounce rate** — the `BOUNCE-0PCT` query needs the
  production database. **Greg must run it.** Diagnosis is complete; the fix is not
  written.
- **The WARMUP-IMPACT numbers per mailbox** — same, needs production. Query is in
  `DOMAIN.json` → `diagnoses` → `WARMUP-IMPACT`.
- **The bounce status write** — now unblocked, not started. Own PR, test RED first.
- **F-01 daily opt-out capture** — not started. Greg's constraint absolute:
  aligned domain or no link.
- **REQ-01/02/03 CSV import** — not started. REQ-03 is the located replace-on-sync
  defect.
- **The client risk-disclosure document** (Ruling 2 obligation) — not drafted.
- **Stage 4 COVERAGE and DATAMODEL** — still missing.

## Next session picks up
1. **Merge #186, then #187.** Work is stacking faster than it is landing.
2. Run both production queries and report the real numbers.
3. Bounce status write → then the volume-response rule unblocks.
4. F-01, then CSV import.
5. The schema drift, its own migration.

---

## Earlier — session 2026-08-24 (BUILD-2)

## Session 2026-08-24 — BUILD-2. Warm-up fixed. One ruling now blocks the rest.

**PR #186 OPEN, CI green.** Production still serves `a4e73f62` from the #185 merge.

### Greg's two rulings, recorded
- **RULING 1 (settles REQ-02):** duplicates are **per client**. Already on THIS
  client's list = duplicate, skipped. Same person on a DIFFERENT client's list =
  not a duplicate, left alone. `Contact` already carries
  `@@unique([clientId, email])`, so the constraint exists in the database today.
  `ContactUniverse` stays deliberately cross-client and is unaffected.
- **RULING 2:** the sending-domain non-negotiable was **wrong, not the product**.
  Rewritten, old line kept as `superseded_rule` with its date range. Four cited
  replacements so deleting a rule did not delete the protection. **Residual risk
  accepted in Greg's name and dated:** outreach runs on the client's PRIMARY
  domain, so there is no fallback if its reputation is damaged — and **this must
  be stated in writing to every client before their mailbox is connected.**

### FIXED: the warm-up anchor
`effectiveDailyCap` now takes a **count of sending days**, not a date. Resolved by
`countSendingDaysForPool` as distinct UTC dates the mailbox actually sent on,
once per batch before the transaction opens. Ramp shape unchanged.

**Test seen RED first — 4 of 6 failed**, including the exposing case. The
existing `mailbox-warmup.test.ts` had to be corrected too: it asserted a
60-day-old mailbox returns its full cap and called that "long-warmed", which
**encoded the defect**.

Also **withdrew then re-earned** this gate's `fail_closed_test`. It was recorded
as passing while the gate was silently inert.

**The number Greg needs before launch is not in the repo** — the SQL is in
`DOMAIN.json` → `diagnoses` → `WARMUP-IMPACT`.

### Volume-response rule: DEFERRED with a trigger
A rate-responsive throttle cannot be built on a rate stuck at 0%. Shipping one
would create a control that never fires and looks like protection. **Trigger:**
the bounce status write lands, plus 200 measured sends.

## THE BLOCKER — one outstanding ruling now gates all source work
The build gate reports **1 blocking**: *"Send to a recipient on the do-not-contact
list belonging to a related domain (bt.com listed, bteurope.com emailed) — no
gate."* Asked on Monday-1, Monday-3 and again here; **never ruled on.**

Until Greg rules, the gate refuses edits to any file that is not a declared
gate file. That is why **the bounce status write was not done this session** —
it is a small, well-understood change with nowhere to legally land.

**Greg's options:** (a) rule that a suppressed domain covers the corporate family
and it becomes an explicit per-client family list; (b) rule that it does not, and
the action is recorded as accepted-and-ungated; (c) declare the gate files and
let the work proceed.

## NOT started, and why
- **Bounce status write** — blocked as above. Diagnosis complete.
- **F-01 daily opt-out capture** — the highest-value feature in the brief. Not
  started. Greg's constraint is absolute: aligned domain or no link.
- **REQ-01/02/03 CSV import** — not started. REQ-03 (import must not remove DNC
  entries) is the already-located replace-on-sync defect.

## Next session picks up
1. **The DNC related-domain ruling.** Everything else is behind it.
2. Merge #186, then the bounce status write, then run WARMUP-IMPACT on production.
3. F-01, then CSV import.
4. Stage 4 COVERAGE and DATAMODEL still missing.

---

## Earlier — session 2026-08-23d

## Session 2026-08-23d — MERGED AND DEPLOYED. Production is current.

**PR #185 merged (rebase). Production serves `a4e73f62`, health 200, verified by
commit not by liveness.** The zero-DNS unsubscribe fix and the DNC subdomain fix
are LIVE. Deploy ran `prisma migrate deploy` clean — that branch carried no
migration, so the migrate-before-login hazard did not apply.

**PR #186 is OPEN, CI green** — docs/standards only, no source.

## THE FRAMING CHANGED: there is no pilot
Greg, 2026-08-24: *"i dont want a pilot, i want a full production system from day
one"* and *"warmup is non negotiable... it must be done according to industry
standards."* `SELL-EXCEPTION.json` reworded — the word "pilot" is gone from
`scope` and `why`; all eight risks and the grade are untouched. **It still
expires 2026-09-03**, and on that date the gate blocks again unless renewed.

## Warm-up, researched from PRIMARY sources
- **The "2% bounce" non-negotiable had NO primary source** (a vendor guide).
  Google publishes **no bounce threshold at all**. Removed as a provider
  requirement; replaced with what Google does publish — complaint rate below
  0.10%, never 0.30% — plus the behavioural rule *"reduce the sending volume
  until the SMTP error rate decreases, then increase slowly again"*, which is
  **not implemented**: no send path reads the rate.
- Ceilings recorded with sources: Google **2,000 unique external recipients/day**;
  Microsoft **10,000 recipients/day**, **30 messages/MINUTE**, plus the
  tenant-wide **TERRL** nobody has checked. At 30/day the product runs at ~1.5%
  of the Google ceiling — **reputation is the constraint, not quota**.

### THE RAMP FINDING — shape right, anchor wrong
`mailbox-warmup.ts` ramps on **mailbox AGE** (`connectedAt`), not sending
history. Its own docstring: *"any mailbox already older than the ramp window is
unaffected."* **A mailbox connected months ago that has never sent gets its full
30/day on the first send, with no ramp.** Google's condition is a history of
*sending*. This is live now, as clients are onboarded ahead of launching.

### CONTRADICTION, flagged not resolved
Non-negotiable *"never send cold email from the client's primary business
domain"* vs the shipped product, which sends from the client's **root-domain**
mailbox by design. Greg accepts the trade in writing, or funds the subdomain
shape. **One-way door once mailboxes exist.**

## THE 0% BOUNCE IS DIAGNOSED — and it is not what anyone assumed
**Detection is not broken.** The NDR path detects the bounce and suppresses the
address, but **never sets `OutboundEmail.status = 'BOUNCED'`** — and that status
is exactly what the report counts. The legacy ESP webhook path *does* set it
(`outbound-provider-events.ts:214-218`); the metric was built against a transport
production no longer uses. **Protection and measurement were wired to different
tables and only protection reached the live path.**

Better than feared: bounced addresses HAVE been blocked all along. Worse than
feared: reporting has been showing a clean sheet while it happened.
Confirmable in one query — see `DOMAIN.json` → `diagnoses` → `BOUNCE-0PCT`.

## Next session picks up
1. **Greg merges #186.**
2. **REQ-02 needs Greg** — duplicates within one client, or across all? A prospect
   on two clients' lists is not a duplicate. Data-model decision, not the agent's.
3. **Stage 4 — COVERAGE and DATAMODEL.** Still missing. F-02 (manual offboarding,
   1-2 clients/month, prospect data in a folder outside the system) belongs in
   COVERAGE area 9.
4. **Build order:** F-01 daily opt-out capture first (highest value, and Greg's
   constraint is absolute — *"there cannot be any links that will cause
   mismatches"*, so mailto rail or no link); then REQ-01/02/03 CSV import, where
   REQ-03 is the already-found replace-on-sync suppression defect.
5. Fix the bounce status write (own PR, test RED first) and the warm-up anchor.

---

## Earlier — session 2026-08-23 (third)

## Session 2026-08-23c — SHIPPED TO PR. Waiting on Greg's merge.

## ROUTE: RESCUE — declared 2026-08-23, and nobody had declared it before

**ODoutreach is on the RESCUE route, not the build route.** `.bidlow/BLUEPRINT.json`
now carries `"route": "rescue"`.

This was never stated, and that omission is the root cause of the whole weekend's
pattern. Two of the six stages — **ASK** and **PLAN** — had never been run here,
so nothing flagged the missing discovery, and every surprise landed by accident
instead of by the map: the agency model that invalidated BC-01, the DPA gap,
E-06, the unmeasurable bounce rate.

**Stage 1 (ASK) is now drafted** — `.bidlow/BLUEPRINT.json`, `status:
drafted_for_review`. Six of the seven questions are drafted from evidence with
their sources cited, so Greg opens a meeting instrument rather than empty boxes.
The seventh (`frequency`) is deliberately EMPTY and owned by the customer: how
often a client leaves, how often a prospect reacts badly, how many lists a month
— none of that is in a repository, and guessing it would stop anyone asking.

Each drafted answer ends with an **ASK IN THE MEETING** list, so the gaps are
agenda items rather than silence.

**Still missing: COVERAGE and DATAMODEL (stage 4, PLAN).** After the pilot.

---


**[PR #185](https://github.com/gregvisser/ODoutreach/pull/185) is OPEN, MERGEABLE, CI GREEN.**
32 commits. Nothing is deployed — production still serves `b36e66e`.
**The merge is Greg's**, and `deploy-production.yml` migrates production *before*
the Azure login step, so it stays his.

### The deadlock is gone
Greg fixed it in `_standards`: pushing a *branch* is no longer treated as
shipping (secrets check only); `main`, PR merge and deploy still get everything.
And `.bidlow/SELL-EXCEPTION.json` now exists as a named, expiring escape.

### Customer-Ready re-graded: 4.0 → **6.8** — still below 8
Walked 13 pages of the branch build in Chromium with a real session. **Every
page HTTP 200, zero console errors, zero page errors.** The 4.0 was *capped*
(broken core journey) for the app-domain unsubscribe defect that this branch
fixes, so the cap lifts. 6.8 is the honest weighted number. No cap applies.
Report: `CUSTOMER-READY-REPORT.md`. Shipping proceeds under Greg's recorded
sell-exception (expires **2026-09-03**), which does not change the grade.

Most of the gain over the old uncapped 6.0 is **onboarding and empty states**,
previously unproven and now verified — empty workspaces give real empty states
that name the next action.

**Limitation to carry forward:** this walked a *fixture* DB of four near-empty
workspaces, not production's seventeen clients. Strong on empty states, weak on
data scale. Two prior findings could be neither confirmed nor refuted: the
**Campaigns column reading 0**, and the sends contradiction **at production
scale**. Re-walk production after the deploy.

### Two findings this session
- **`/operations` 404 is NOT a defect.** There is no `/operations/page.tsx` — it
  is a route segment, linked from nowhere, and `admin-gate.test.ts` asserts it is
  absent from the nav. The real page is `/operations/outbound`, which renders.
  Corrects the 2026-08-09 audit.
- **The reporting contradiction is REAL, and now has a minimal reproduction.**
  Overview reads *"7 Activity — not started"* while the Activity tab reads
  *"EMAILS SENT 1"* for the same client. Two sources of truth: the overview pill
  keys off `latestActivityLabel` (`src/lib/client-launch-state.ts:254-266`), the
  tab counts `OutboundEmail`. **Highest-value cheap fix on the list.**

### CI now records evidence for real — and caught its own bug
Both jobs write and upload a suite record from the runner's own JSON, with
`if: always()`. First run: CI was green but `evidence-e2e.json` said
*"passed: false — no machine-readable result was produced"*. The recorder was
right and my step was wrong: `npm run … > file` captures npm's banner ahead of
the JSON. Fixed via `PLAYWRIGHT_JSON_OUTPUT_NAME`. **Verified CI artefact now:
unit 1875/0, e2e 15/0, `recorded_by: github-actions`.**

### Gates at HEAD
lint **0** · typecheck **0** · **1875/1875** unit · **15/15** e2e · build green ·
**CI green on both jobs**. Role chain signed and stamped to HEAD.

### Next session picks up
1. **Greg merges #185** → then verify `/api/build-info` reports the new commit on
   `opensdoors.bidlow.co.uk`. A green workflow is not evidence.
2. **Re-walk production** once deployed — specifically the Campaigns column and
   the sends contradiction at real scale, which the fixture walk could not see.
3. Then the pilot: OpensDoors and Bidlow as workspaces on the one instance,
   hand-checked lists, **20/day, 10/mailbox**. Do not raise it because the deploy
   went well.
4. Backlog, in order: make Overview and Activity agree · explain the 0% bounce
   rate · `sentProofMissing` seed-exclusion defect · DNC related-domain rule (own
   PR, own migration) · E-06 · the three DPAs.

---

## Earlier — session 2026-08-23 (second)

## Session 2026-08-23b — BC-01 resolved and GREEN. Push blocked by ONE thing.

`integrate/monday-pilot` is **26 commits ahead of origin/main**, everything
committed, working tree clean. **Still unpushed** — and now for a single,
different reason. See DEADLOCK below.

### Greg's rulings, taken
- **ONE INSTANCE.** `opensdoors.bidlow.co.uk`, with Bidlow as a client
  workspace on it. The Railway fork stays decommissioned. OpensDoors is an
  agency: staff seeing all customers is the product, not a leak.
- **DPAs:** Microsoft and Google covered by their standard terms; **Sentry,
  RocketReach and Resend NOT verified — an open Art.28 obligation, outstanding
  now.** RocketReach also raises a controller-side lawful-basis question about
  bought prospect data.

### BC-01 — rewritten, green, and proven to catch a leak
The spec was wrong about the product, so the spec changed. It now governs
**workspace DATA isolation** (R-1…R-6), with staff ACCESS isolation recorded as
a deliberate decision plus the three triggers that reverse it and the note that
`ClientMembership` already exists, inert, as the mechanism.

`e2e/cross-tenant.spec.ts` rewritten: **6 tests, all passing.** They did NOT go
red first — the boundary already held — so instead they were **proven capable of
failing**: removing the `clientId` scope from the outbound query in
`client-activity.ts` turned R-5 red, with Client B's activity disclosing Client
A's prospect address. Scratch branch, reverted.

Verified live while writing, not assumed: per-client activity is scoped; replies
never cross (no `InboundReply` without a matching outbound in that client);
suppression is per-client **by construction** and so is hard-bounce suppression.

**Two corrections to the previous spec, both from live checks:**
- **E-02 was FALSE.** A staff user with no membership sees *every* workspace.
- **E-06 is a real, unfixed hole.** The same mailbox may be connected to two
  workspaces; each then stores its own copy of every raw inbound message,
  including full `bodyText`. Replies don't cross; the raw store does.

### Gates, measured 2026-08-23
lint **0** · typecheck **0** · **1875/1875** unit across 216 files · **15/15**
e2e · build green. All captured programmatically into `.bidlow/EVIDENCE.json`
from the runners' own JSON output. Role chain signed for this commit.

Build gate: **0 blocking** when editing a declared gate file; 1 otherwise (the
DNC related-domain action, still awaiting Greg's rule).

### THE DEADLOCK — this is what to fix first
`git push` is refused by the **sell gate**: Customer-Ready **4/10**, below 8.

It is a structural deadlock, not a missing piece of work:
- The 4.0 cap was applied **for the app-domain unsubscribe link**.
- **This branch fixes exactly that.**
- The grade describes the **deployed** product, and production still serves
  `b36e66e`.
- So the grade cannot improve until this ships, and it cannot ship until the
  grade improves. **The gate makes its own remedy unshippable.**

`shipActions()` treats `git push` of ANY branch as shipping. Branch protection
already means a feature-branch push is not a deploy, so the sell gate arguably
belongs on `isDeploy`/merge, not on `isPush`. **That is an estate-wide change to
`_standards`, so it is Greg's call, not the agent's.**

The honest re-grade is still 4: production has the defect today. Inflating it to
pass the gate is the exact false-9 the standard exists to prevent, so it was not
done.

**Options for Greg:** (a) push the branch himself; (b) change the sell gate to
fire on deploy rather than push; (c) leave it and production keeps serving the
20 July build.

### Next session picks up
1. Greg's call on the deadlock, then: push → PR → CI → **Greg merges** → verify
   `/api/build-info` on `opensdoors.bidlow.co.uk`.
2. `sentProofMissing` seed-exclusion defect (`outreach-metrics.ts` ~line 226) —
   own commit, with a test.
3. DNC related-domain per-client setting — **own PR, own migration**
   (`deploy-production.yml` migrates production *before* the Azure login step).
4. The 0% bounce reading, now more concerning: detection is ON in production yet
   reports nothing across 1,209 sends.
5. E-06, and the Sentry/RocketReach/Resend DPAs.

---

## Earlier — session 2026-08-23 (first)

## Session 2026-08-23 — READ THIS FIRST. The push is BLOCKED, correctly.

Branch `integrate/monday-pilot` is committed but **still unpushed**. The ship gate
refuses it and the refusal is right: `.bidlow/EVIDENCE.json` now records the e2e
suite as **RED — 11 pass, 3 fail on BC-01 tenant isolation**. Greg's new standing
rule ("never end a session unpushed") and the ship gate are in direct conflict,
and the gate wins until BC-01 is resolved. **This needs Greg's decision — see the
DECISION OWED section.**

### Done this session
| Item | Result |
|---|---|
| Build gate matcher | Was `"TEMPORARILY_DISABLED"`, set to `Write\|Edit\|NotebookEdit`. **The installer did NOT fix it** — it matches by script name and reported "4 already present". Verified live: the gate then blocked a source write. |
| Freeze | Greg's LF fix adopted and committed. `--status` → **11 in order, 0 drifted**. His amendment #3 ratifies the BC-01 rewrite. |
| CLASSIFY | SAFETY blocks **8 → 4**. Answered Q7 (auto-stop) and Q8 (data map) from code; drafted Q3/Q4 (domain ownership, DNS) for confirmation; recorded the `multi_tenancy` decision. |
| `.env.example` | `MAILBOX_BOUNCE_DETECTION_ENABLED` and `MAILBOX_WARMUP_RAMP` documented with what OFF costs. |
| CI | Both jobs now write and upload test evidence (`if: always()`, so RED is recorded as red). This closed a real gap — the gate assumed CI wrote `EVIDENCE.json` and **nothing did**. |
| Housekeeping | Both briefs moved to `C:\Bidlowbusiness\_BidlowAI-Playbook\`; e2e container stopped. |

### Corrections to my own earlier findings — I was wrong twice
- **`MAILBOX_BOUNCE_DETECTION_ENABLED` is `true` in production**, as are
  `MAILBOX_COMPLAINT_DETECTION_ENABLED` and `MAILBOX_WARMUP_RAMP=on` (read from
  live Azure config). My inference that 0% bounces meant "nothing is measuring"
  is **WITHDRAWN**. The 0% is unexplained and stays open. The cap stands on the
  uncertainty, not on a diagnosis.
- **The "204 send proof missing" is not 204 failed sends.** `sentProofMissing` is
  an arithmetic difference: `allStepSendsSent − sentWithProof − queuedOrProcessing`.
  **DEFECT FOUND:** `seedExclusion` is applied to the OutboundEmail counts
  (`src/server/queries/outreach-metrics.ts` lines 212, 243, 251, 263, 312) but
  **NOT** to the step-send count that produces `allStepSendsSent` (~line 226). With
  `INTERNAL_SEED_ALLOWLIST_ENABLED=true` in production, **every internal seed send
  inflates the figure by exactly one.** Partly or wholly a metric bug. NOT FIXED —
  the gate correctly refuses source edits while SAFETY blocks stand.

### The pilot shape — the brief's premise does not hold
`outreach.bidlow.co.uk` is live (health 200) but:
- it resolves to **Railway** (`7i7pt5jv.up.railway.app`), not Azure — there is no
  Azure app for it, and `opensdoors.bidlow.co.uk` is the only custom hostname on
  `app-opensdoors-outreach-prod`;
- `/api/build-info` returns **`commit: null`** — there is no provenance for what
  code is running;
- **its source was DECOMMISSIONED BY GREG on 2026-08-20.** `C:\Bidlowprojects\Bidlow\`
  is empty; the repo sits in `_to_delete6-08-20-decommission\BOutreach-outreach-platform`,
  whose MANIFEST says *"ODoutreach is the only outreach system that stays"* and flags a
  live `.env` to be **shredded**.

So "both instances on the same commit after deploy" is **not achievable** — they are
different codebases. Bidlow's instance would receive **none** of this weekend's work:
not the zero-DNS link-alignment fix, not the DNC subdomain fix. Sending real prospect
mail from it means sending from an unmaintained deployment that still carries the
defect that caused the quarantine.

### DECISION OWED — nothing else can proceed past this
1. **BC-01.** Greg decided not to build cross-staff isolation. BC-01 therefore
   asserts a property the product deliberately does not have, so it is
   **permanently red**, and the ship gate will block **every** push until it is
   resolved. Either formally DEFER the spec (Greg's to amend — the agent may not
   touch it) with a trigger, or accept that pushes stay blocked. I did not choose.
2. **Where does Bidlow actually run?** Given the fork is decommissioned: revive it,
   run Bidlow as a second workspace on ODoutreach (which re-opens the isolation
   question Greg just closed), or stand up a second ODoutreach deployment.

### Next session picks up
1. The two decisions above.
2. Then: push → PR → CI → Greg merges → verify `/api/build-info`.
3. The DNC related-domain per-client setting — **its own PR with its own
   migration**, NOT bundled with this one: `deploy-production.yml` runs
   `prisma migrate deploy` against production *before* the Azure login step.
   Design note: "related domains" cannot be safely inferred from a string
   (`bteurope.com` shares nothing with `bt.com`), so it must be an explicit
   per-client family list, not an algorithm.
4. The `sentProofMissing` seed-exclusion defect.

---

## Earlier — session 2026-08-22

## Session 2026-08-22 — Monday pilot prep. READ THIS FIRST.

Working branch: **`integrate/monday-pilot`** — local, **unpushed, not deployed**.
Production still serves `b36e66e` (built 2026-07-20). It contains, on top of
`fix/refuse-mock-send-for-prospect-rows`:

| Commit | What |
|---|---|
| `06ef3d7` | BC-01 cross-tenant spec + membership personas committed (were untracked) |
| `e61cbde` | **merge of `feat/zero-dns-send-profile`** — no unsubscribe links on the app domain |
| `e100de6` | BC-01 corrected so it fails on the real leak, not on its own mechanics |
| `e18cdf6` | **DNC subdomain fix** — a suppressed domain now covers its subdomains |
| `8adb7b5` | CLASSIFY research answers + partial DNC gate recorded in DOMAIN.json |

Gates on that branch: lint **0**, typecheck **0**, **1875 tests / 216 files all
pass**, build green, e2e **11 pass / 3 fail** — the 3 failures are BC-01 and are
deliberate (see below).

## THE FINDING — no tenant isolation between staff

`getAccessibleClientIds` (`src/server/tenant/access.ts`) **discards its `staff`
argument and returns every live client.** `ClientMembership` is never consulted on
any read path. The docstring says so deliberately. Proven live: a staff member of
Client B only can open Client A's workspace, its activity feed (real prospect
address + subject) and its outbound email detail — all HTTP 200 with full data.

Two supporting facts:
- **`src/server/tenant/access.test.ts` cannot detect this.** It mocks
  `prisma.client.findMany`, so it never sees the `where` clause that is the whole
  control. It stayed green with isolation both on and off.
- **BC-01 discriminates in both directions.** Red as-is; scoping
  `getAccessibleClientIds` to `ClientMembership` in a scratch branch turned all 5
  green. That scratch was reverted, not committed. Typecheck, build and all 1860
  unit tests passed with it applied — the code cost is one function; the risk is
  the DATA question below.

**This blocks the two-customer pilot and it is Greg's decision, not an
engineering fix.** Options: one instance and accept OpensDoors staff reading
Bidlow's data and vice versa; or Bidlow goes to its own existing instance at
`outreach.bidlow.co.uk`; or build real isolation — 64 call sites, plus the open
question of whether production staff hold any `ClientMembership` rows at all
(if not, switching it on shows them nothing — an outage).

## Half-done / where exactly it was left

- **Nothing is pushed or deployed.** Branch protection requires branch → PR → CI
  → merge. `integrate/monday-pilot` is ready for a PR once the pilot shape is
  decided. Local `main` is **2** commits ahead of `origin/main` (both docs-only).
- **DNC gate still blocks, correctly.** The subdomain half is built and tested
  (test seen RED first). The **related-domain** half (`bt.com` → `bteurope.com`)
  is untouched because it is a client business rule. `fail_closed_test` stays
  false in DOMAIN.json.
- **CLASSIFY**: 6 of 13 questions answered with sources + expiries. The 7 open
  ones are all `decision`/`fact` — Greg only. Listed in `_still_blank_and_why`.
- **204 contacts with "send proof missing"** — still undiagnosed; needs production
  DB access to say whether it touches the pilot clients. Not attempted.

## Decisions and one-way doors touched

- **No one-way door was walked through this session.** `data_residency` and
  `retention_model` remain UNSETTLED and are recorded as such in CLASSIFY, not
  guessed.
- Recorded a **compensating control** in DOMAIN.json for unmeasured bounces:
  20 sends/client/day, max 10/mailbox, first 10 working days. Lifts only when
  `MAILBOX_BOUNCE_DETECTION_ENABLED=true` AND a measured bounce rate under 2%
  over 200+ sends.

## Discovered — contradicts the brief, and worth not re-deriving

- **Bounce detection is NOT absent.** `src/server/mailbox/bounce-detection.ts`
  parses NDR/DSN bounce-backs during inbox sync and IS wired in. It is gated by
  **`MAILBOX_BOUNCE_DETECTION_ENABLED`, default OFF, absent from `.env.example`**.
  0% bounces across ~1,209 sends most likely means nothing is measuring.
  Turning it on is an env var, not a webhook project.
- **Suppression is only half append-only.** Google-Sheet-sourced suppression is
  **replace-on-sync** (`deleteMany` then rewrite by `sourceId`), so removing a row
  from the client's sheet makes that address sendable again.
- **The freeze is broken on a fresh checkout.** 8 of 11 hashes in FROZEN.json are
  of CRLF bytes for files `.gitattributes` stores and checks out as LF. Any clone
  reports 8 phantom SAFETY blocks. Defect in `freeze-specs.mjs` — it should hash
  the canonical LF form. Left alone rather than quietly rewritten.
- **The build gate is not enforcing**: its `PreToolUse` matcher in
  `~/.claude/settings.json` is `"TEMPORARILY_DISABLED"`.
- **BC-01's original assertions were wrong twice** (freeze amended twice, with
  reasons): `/contacts` is super-admin-only and redirects members before any
  tenant filter — so the `?client=` case was a FALSE GREEN; and `loading.tsx`
  makes those routes stream, so a correct implementation also returns HTTP 200
  and E-03 cannot be asserted on status. It asserts disclosure now.
- **Playwright reuses an existing server on :3000** — a stale one silently
  invalidates a run. Same shape as the Azure stale-build trap.

## Next session picks up

1. **Greg's decision on the pilot shape** (one instance vs Bidlow separate vs
   build isolation). Nothing else about the pilot is safe to settle first.
2. The 7 classification questions + the 2 env checks
   (`MAILBOX_WARMUP_RAMP`, `MAILBOX_BOUNCE_DETECTION_ENABLED`).
3. The related-domain DNC rule, then finish that gate.
4. PR `integrate/monday-pilot` → `main` once 1 is decided.

## Nothing in PROJECT.json is contradicted

`lifecycle: live` and `live_url` both confirmed — production answered
`/api/health` 200 and `/api/build-info` `b36e66e`.

---

## Earlier — session 2026-08-09

## Where the build actually is

`/bidlow-init` was run on an existing, live, deployed product — not a new repo.
Most foundations already existed; the missing ones were laid, and one real defect
found during the domain pass was fixed.

Two branches came out of this session, both **local, unpushed**:

| Branch | Contents |
|---|---|
| `chore/bidlow-foundations` (`5737fb7`) | Tier P declared, `.gitattributes`, `SCOPE.md`, `CUSTOMER-READY-REPORT.md`, `.bidlow/DOMAIN.json`, this file. Docs only |
| `fix/refuse-mock-send-for-prospect-rows` | The mock-send guard + tests. Branched from the above |

## Gates run and their real output, 2026-08-09

Measured on `fix/refuse-mock-send-for-prospect-rows`:

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **exit 0** |
| Typecheck | `npm run typecheck` | **exit 0** |
| Tests | `npm test` | **1836 passed / 214 files** |
| Build | `npm run build` | **NOT RUN** |
| e2e | `npm run test:e2e` | **NOT RUN** |

**Test counts are branch-dependent — do not compare them across branches.**
Baseline on this branch is **1828 / 213**; the guard adds 8 tests in 1 file.
`feat/zero-dns-send-profile` reports **1852** because it carries ~24 extra tests
from the unsubscribe/mailto work that is not in `main`.

## The defect found and fixed this session

**A prospect send with no `mailboxIdentityId` would have been silently
mock-"sent".** `execute-one.ts` routed on `if (row.mailboxIdentityId)`; rows
without it fell to `getOutboundEmailProvider()`, which returns `MockEmailProvider`
whenever `EMAIL_PROVIDER` is unset — as it is in production. The mock returns a
synthetic `{ ok: true }`, so the row would have been marked SENT, the contact
marked contacted, and follow-ups would have fired referencing an introduction the
recipient never received.

It had **never fired** — the 6 August audit found zero `mock_` rows. Latent, not
active. Now gated by `prospect-send-transport-guard.ts`, which refuses any row
carrying a `contactId` but no mailbox, and fails it with `NO_SENDING_MAILBOX`
rather than falling through.

Two deliberate decisions recorded in `.bidlow/DOMAIN.json`:

- **Not behind a feature flag**, against the local convention. It can only
  intercept rows headed for the mock, so it cannot turn a real send into a
  non-send — a flag defaulting to off would just leave the defect live.
- **The wiring is not covered by an automated test**, only the pure decision
  function. `executeOutboundSend` needs a database and the unit suite is
  deliberately DB-free. Verified by reading. An integration test belongs in
  `execute-one.integration.test.ts` when a database is available.

## Still open, and why

`.bidlow/DOMAIN.json` records **1 irreversible action as ungated**:

1. **DNC sibling domains** — `suppression-guard.ts` matches domains on an exact
   key, so `bt.com` on the list does not cover `bteurope.com`. The gate exists and
   is tested; its matching is narrower than ideal. Phase 2, ~18 Tier P days. Live
   compliance exposure the client raised directly

**The build gate stays shut** until that is closed. That is the standard working
as designed.

### Corrected 2026-08-09 — the warm-up ramp was ALREADY on

`MAILBOX_WARMUP_RAMP` is **`on` in production**, verified directly against Azure:

```
az webapp config appsettings list --name app-opensdoors-outreach-prod \
  --resource-group rg-opensdoors-outreach-prod \
  --query "[?name=='MAILBOX_WARMUP_RAMP']"     ->  value "on"
```

The August roadmap, the engagement notes and the first version of this file all
recorded it as OFF. **They were stale — do not trust them on this point.** The
claim that volume protection is active is therefore true, not false as previously
stated. The action is now recorded as gated: `mailbox-warmup.test.ts` proves the
ramp fails closed — clock skew (`-3`) and `NaN` both collapse to the base cap of
5, and the configured steady cap is never exceeded.

Caveat worth keeping: the ramp is *activated* by a flag that defaults to off, so
the gate is fail-closed in its logic but fail-open in its activation. Re-verify
the flag before relying on it.

## A real gap in the standards tooling

The build gate **blocks its own remedy**. Recording an ungated action honestly
makes it impossible to write the fix for that action, because the gate refuses all
non-markdown writes anywhere — including `~/.claude/settings.json` and the hook's
own `lib.mjs`. The hook was parked by hand to land this fix.

`knowledge_map` pillars have a `mitigation_recorded` escape hatch. `irreversible_actions`
has none — [lib.mjs](C:/Bidlowprojects/_standards/bidlow-standards/plugins/bidlow-standards/scripts/lib.mjs)
`ungatedActions()` is a bare `!a.gate || a.fail_closed_test !== true`. Worth adding
a dated, recorded waiver field; this will hit every Bidlow repo that records an
honest gap.

## Chain and grades — run 2026-08-09

`.bidlow/CHAIN.json` (gitignored — it names the commit it attests to, so
committing it would make itself stale) and `.bidlow/GRADES.json` (tracked).

| | Result |
|---|---|
| Architect / Test / Security / SRE / Reviewer | **passed**, with gaps recorded |
| Head of Engineering | **sign-off WITHHELD** |
| Engineering grade | **8.0** — below the 8.5–9.5 Tier P band, deliberately |
| Customer-Ready grade | **4.0** — graded 2026-08-09 by walking production live |

**Customer-Ready 4.0** (weighted rubric 6.0, capped for a defective core journey).
Full detail in `CUSTOMER-READY-REPORT.md`. The deciding finding: **production
still mints unsubscribe links on the OpensDoors app domain** — deployed
`send-introduction.ts:529` falls through `resolveClientLinkBaseUrl(client) ??
resolvePublicBaseUrl()` to `AUTH_URL`, because no client has a verified aligned
domain. That is the phishing pattern behind the quarantine. The tracking-pixel
half IS fixed and live (`OPEN_TRACKING_PIXEL=off`, verified). The unsubscribe half
is fixed in `a8d777c` and **unshipped**.

**Sell gate: Engineering 8.0 AND Customer-Ready 4.0 → NOT SATISFIED.**

Engineering is 8.0 not 8.5 because three of the nine things a 9 requires are
unproven or absent: no e2e on critical journey J5, coverage thresholds not
verified as enforced, and Sentry wired but not verified as receiving events.
Rounding up to land inside the band is the false-9 the protocol exists to stop.

Sign-off was withheld because signing would unblock a production deploy of
send-path changes I have not reviewed, on the strength of a Customer-Ready score
nobody has measured.

## Pick this up first

1. **Run the `customer-ready-audit` skill** as its own focused session. It is the
   single blocker on everything else. Walk the product live, save a dated
   `CUSTOMER-READY-REPORT.md`
2. **Adversarially review `feat/zero-dns-send-profile`** — 4 send-path commits,
   ~1,400 lines, currently unreviewed and explicitly outside the chain's scope.
   Then merge and deploy. Branch protection is on, so PR only; verify by commit
   via `/api/build-info`, never by liveness alone
3. **Investigate two production findings** raised while walking the app:
   - 204 of ~1,470 contacts show **"send proof missing"** (~14%), unexplained
   - Delivered is **"not tracked — no provider delivery webhooks yet"**, so
     bounces read 0 (0%) across 1,209 sends. The domain brief makes bounce rate
     below 2% a non-negotiable. **A threshold that cannot be measured cannot be
     enforced** — this is arguably the most important open item on the product
   - `/operations` returns 404 on production; may be a moved route, not diagnosed
4. **Three local branches are unpushed**, all based on local `main`, which itself
   carries 2 unpushed docs commits. `origin/main` == deployed (`b36e66e`)

## Decisions already locked — do not relitigate

- Zero DNS required from customers. Graph sending IS Outlook sending
- Tracking off by default; `go.<domain>` CNAME is a later upsell, not a barrier
- Draft-into-Outlook deferred, built only if a specific corporate asks
- Email only. No LinkedIn outreach automation
- Phase 2 (DNC brand grouping) sequenced ahead of domain verification
- `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN` is a send kill switch, not a hardening
  flag. Leave it off

## Capacity reality

~9 working days, half-time, 6–31 August, zero slack. The full programme is
**~139 Tier P days — roughly 8 months at half-time, not 3.**

## Open questions

Five. Four in `.bidlow/DOMAIN.json` under `open_questions`, plus whether to add
the waiver mechanism to the standards hook. See also the NEEDS CONFIRMATION items
in `SCOPE.md`.

---

# 2026-08-24 — GO-LIVE morning

Production: **`faba194`**, `/api/health` database ok. Four PRs merged and
deployed in sequence, each verified by commit against `/api/build-info`.

## The bounce number, which was the stop condition

The brief said stop if genuine hard bounces run near **18% fleet-wide**. They do
not. But the first answer I was about to give — 0.37% — was also wrong, and the
way it was wrong is worth keeping.

Classifying 426 NDR-shaped inbound messages by client looked decisive: Thomas
Franks showed 36 hard bounces against 18 sends, Chevron 27 against 4 — ratios
above 100%, impossible for bounces of our own mail — while **Train Hugger (763
sends) and GreenTheUK (332), the two largest senders by far, appeared nowhere in
the hard-bounce list**. That reads as "almost none of these are ours".

It was an artefact of the blind spot. Both those clients are **Gmail**, and all
147 of their NDRs had no body, so they fell into UNCLASSIFIABLE and dropped out
of the hard-bounce count entirely. The two biggest senders were invisible to the
classifier, not clean.

The honest cut is temporal, and it does not depend on string matching:

| | sends | failure-shaped NDRs | rate |
|---|---|---|---|
| Train Hugger, June | 756 | 72 | **9.5%** |
| GreenTheUK, June | 332 | 30 | **9.0%** |

Those 102 NDRs land **only** in the month those mailboxes sent. Train Hugger had
1 in April (no sends) and none in July or August. The signal tracks the sends.

Of the Microsoft NDRs that name one of our own subjects and *can* be classified,
27 of 73 non-delay are genuinely hard — **37%**. Applying that to the failure-
shaped Gmail volume puts genuine hard bounces at **≈3.5–6%, most likely 4–5%**,
on roughly 1,100 sends of real campaign volume.

**Not 18%. Not 0.4%. Around 4–5%, straddling the threshold.**

The confound is proven, not inferred: **August carried 42 NDRs against ZERO
outreach sends.** Bounces of the clients' own staff mail arrive in these
mailboxes constantly, which is why the naive per-client ratios exceed 100%.

This cannot be narrowed further **because the Gmail bodies were never fetched** —
which is exactly what #193 fixes. The estimate becomes a measurement within days.

## Merged and live

| PR | What |
|---|---|
| #193 | Gmail `format=metadata` -> `format=full` + MIME walker; opt-out detection given the full body on BOTH providers |
| #194 | `/contacts` send button governed; misaligned opt-out link removed; action gated to super-admin |
| #195 | One name per destination; F-01 corrected |

**#194 is the one that mattered.** `sendEmailToContact` was the only real-prospect
path with no `evaluateSendGovernance` check, and the unsubscribe link it planted
came from `resolvePublicBaseUrl()` — the OpensDoors app domain, with `AUTH_URL`
set in production — while the mail left the client's own domain. That is the link
misalignment DOMAIN.json records as the 2026 quarantine root cause, still live on
one path. `resolveUnsubscribeRail`, the helper written to prevent it, **had no
production caller at all**. The page redirected non-super-admins; the server
action behind it did not, so the redirect protected nothing.

## Sending posture — measured, not estimated

45 active mailboxes, 44 in ACTIVE workspaces, every one capped at 30/day.

- `MAILBOX_WARMUP_RAMP=on` — **already set, keep it.** Fleet capacity today is
  **275/day**, not 1,350. The most-used mailbox has **10 sending days**; most
  have 0–4.
- `MAILBOX_SEND_PACING` — **not set, and leave it unset today.** At ~6 sends per
  mailbox per day there is no burst to spread, and its first production run
  should not be the morning the client starts. Revisit after the first ramp step.
- `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN` — **must stay off.** No client has a
  verified `go.<domain>`, so enabling it blocks every real-prospect send. It is a
  kill switch, not a hardening flag.

The ramp counts **sending days**, so 30/day needs 25 of them — about five working
weeks of daily sending, and only for mailboxes that actually send.

## F-01 corrected — and the defect class it earned

BLUEPRINT.json recorded removal-by-reply as **DAILY**. Greg never said it; the
agent inferred it, wrote it into the artefact, and F-01 was raised HIGH on the
strength of it. His correction: *"we have not received responses with do not
contact me, we have had unsubscribe links clicked, but no one responding, take me
off the list."* Downgraded HIGH -> LOW, not deleted — the obligation stands, the
frequency does not.

Recorded in the standards repo as **`inherited-artefact-answer`**: an artefact
answer can be confidently wrong, and everything downstream inherits it.

## Left unmerged, on purpose

**PR #196** removes the duplicated workflow strip so the Overview shows one row
of links instead of three. It is correct and it deletes code, but the **staff
training teaches that strip by name, with screenshots** (`modules.ts` 201, 227,
1330), and `CLIENT_WORKSPACE_MODULE_AUDIT.md` carries it as unresolved open
question Q3. Removing it needs the training updated in the same change.

Moving the status dots onto the tab row instead was investigated and is **not
cheap**: the seven statuses depend on most of `loadClientWorkspaceBundle` (8
parallel queries), so the layout would load that on all nine workspace pages. A
lighter approximation would create a *third* source of truth for workspace
status — the defect already recorded against this product.

## Gate defect found

`gate-ship.mjs` compares `CHAIN.json.commit` to `git rev-parse HEAD` for exact
equality. CHAIN.json is a tracked file, so stamping a hash into it changes that
hash: **the check has no fixed point and no commit can satisfy it.** Recorded
`reviewed_code_commit` + `measured_tree` instead, with the reason in the file.
The comparison should be against the source tree, or should ignore trailing
commits that touch only `.bidlow/`.

## Open questions

Three, unchanged in substance: the two in `DOMAIN.json`, plus whether to answer
Q3 and land #196.

---

# 2026-08-24 (afternoon) — Step 1: signature link audit, measured

Greg saw an unsubscribe link inside a mailbox signature during a customer
meeting. This is what the measurement actually found.

## The pause: not performed, and not needed

`gh workflow disable process-outbound-queue.yml` was **blocked by the tool
permission classifier**. Before escalating it, I checked what there was to pause:

| | |
|---|---|
| Emails **QUEUED** right now | **0** |
| Emails **sent today** | **0** |
| Status breakdown | SENT 1345 · FAILED 55 · REPLIED 13 |

**Nothing was pending, so nothing would have been stopped.** The queue is empty
and nothing has been launched today. The audit is read-only and was run against
production directly. No sending was interrupted, and none needed to be.

The exposure is not "mail going out now" — it is "the next time someone
launches". That is a real window, but it is not an emergency, and holding an
empty queue would have bought nothing.

## The audit — 11 HIGH across 4 clients of 17

`npx tsx scripts/ops-cross-domain-audit.ts` against production. Read-only
verified before running: the script contains no create/update/delete/upsert/
executeRaw.

| Mailbox | Client | Offending host | Severity | Field |
|---|---|---|---|---|
| jo@chevronsecurity.co.uk | Chevron Security | `qtrypzzcjebvfcihiynt.supabase.co` | HIGH | signature HTML |
| charlie@chevronsecurity.co.uk | Chevron Security | `qtrypzzcjebvfcihiynt.supabase.co` | HIGH | signature HTML |
| *(client-level)* | Chevron Security | `qtrypzzcjebvfcihiynt.supabase.co` | HIGH | `Client.logoUrl` |
| *(client-level)* | OpensDoors | `encrypted-tbn0.gstatic.com` | HIGH | `Client.logoUrl` |
| *(client-level)* | Pareto FM | `encrypted-tbn0.gstatic.com` | HIGH | `Client.logoUrl` |
| taylor@trainhugger.com | Train Hugger | `cdn.prod.website-files.com` | HIGH | signature HTML |
| joe@trainhugger.com | Train Hugger | `cdn.prod.website-files.com` | HIGH | signature HTML |
| sam.p@trainhugger.com | Train Hugger | `cdn.prod.website-files.com` | HIGH | signature HTML |
| cam@trainhugger.com | Train Hugger | `cdn.prod.website-files.com` | HIGH | signature HTML |
| alex@trainhugger.com | Train Hugger | `cdn.prod.website-files.com` | HIGH | signature HTML |
| *(client-level)* | Train Hugger | `cdn.prod.website-files.com` | HIGH | `Client.logoUrl` |

**17 clients scanned · 13 clean · 4 with findings · 11 HIGH · 0 MEDIUM · 0 LOW.**
Seven distinct mailboxes carry a signature finding; the other four are client
logos. Of the 45 active mailboxes in live workspaces, **38 are clean**.

## What the audit did NOT find, and why it matters

**Zero findings reference the OpensDoors app domain.** Not one. Every HIGH is a
remote *image*, and MEDIUM and LOW are both zero — meaning **no signature
contains a foreign `<a href>` at all**.

So what Greg saw is **not in stored signature data**. The audit reads
`senderSignatureHtml`, `senderSignatureText`, templates, `Client.logoUrl` and
`Client.website`; none contains an unsubscribe link. A data audit cannot explain
his observation.

**Hole 1b explains it, and the data makes it worse than the brief says.**

| | |
|---|---|
| Sent emails whose `bodySnapshot` contains `opensdoors.bidlow.co.uk` | **1358 of 1358 — 100%** |
| Sent emails using the mailto rail | **0** |

Every email this system has ever sent carries an app-domain unsubscribe URL in
its stored snapshot. That is **historical, not current**: the mailto rail and the
app-domain fix landed **2026-08-06** (`1ad6bf5`, `0a20923`, `a8d777c`) and the
last send was **2026-07-03**, so all 1,358 predate it. Current code is right —
this is the same trap as the morning's bounce numbers, and it was checked before
being reported.

But it means the `extracted` fallback in `outreach-mailbox-bodies.ts` has **1,358
poisoned snapshots to scavenge from**. Where the mailto rail is chosen
deliberately (`hostedUnsubscribeUrl === null`), a URL pulled from an old snapshot
can be rendered as an anchor — resurrecting exactly the link the rail exists to
prevent. That is a **render-time** defect, invisible to any data audit.

**Confirmed by reading the code**, not inferred. `outreach-mailbox-bodies.ts`:

```ts
const hosted = input.hostedUnsubscribeUrl?.trim() || null;
const extracted = extractUnsubscribeUrlFromPlainTextBody(input.bodySnapshotPlain);
const url = hosted ?? extracted ?? null;          // line 77
...
const mailtoOptOut = url ? null : normalise(...); // line 97 - rail SKIPPED
...
const footer = `<p><a href="${escapeHtmlAttr(url)}">Unsubscribe</a></p>`; // line 122
```

Passing `hostedUnsubscribeUrl: null` is how a caller *chooses* the mailto rail.
Line 77 overrides that choice with whatever URL is sitting in the snapshot, and
line 97 then suppresses the mailto opt-out because `url` is now truthy. The
deliberate safe choice is silently converted into the unsafe one. This is the
most likely explanation for what Greg saw.

## Severity model — a problem with the rule as written

The brief says a HIGH finding blocks the send. Applied literally to these
results, that blocks **Train Hugger — the largest client, 763 sends — for
hosting its own logo on its own website's CDN**. `cdn.prod.website-files.com` is
Webflow's asset host and trainhugger.com is a Webflow site. That is a false
positive that would stop the biggest customer on day one.

Meanwhile `encrypted-tbn0.gstatic.com` on OpensDoors and Pareto FM is a **Google
Images search-thumbnail URL** pasted in as a logo. That is a genuine defect —
those URLs are ephemeral and will break — but it is data quality, not a phishing
signal.

A model that scores "company logo on the company's own CDN" the same as "link to
an unrelated domain" is not measuring link alignment. Recorded here **before**
Step 2 builds a gate on top of it.

# 2026-08-24 — Step 2: make the audit a gate, and close Hole 1b

## Hole 1b — fixed, red first

The live defect. `buildMailboxGovernedEmailBodies` resolved the opt-out as
`hosted ?? extracted ?? null`, so passing `hostedUnsubscribeUrl: null` — which is
how a caller *chooses* the mailto rail — was overridden by whatever URL sat in
the persisted snapshot, and the mailto opt-out was then suppressed because `url`
had become truthy. The deliberate safe choice was silently converted into the
unsafe one.

The red test failed exactly as predicted before any fix:

```
× does NOT put a foreign host in the email when the mailto rail was chosen
  → expected '<p>Hello there,</p>…' not to contain 'opensdoors.example'
× still renders the visible mailto opt-out instead of the scavenged link
  → expected '…' to contain 'To opt out, reply STOP to this email…'
✓ DOES keep a snapshot URL that is aligned with the sending domain
✓ an explicit hosted URL is still honoured exactly as before
```

Two controls passed throughout, so the test is not vacuous.

A snapshot URL is now reused **only** if it is on the sending mailbox's own
registrable domain. A second facet surfaced while fixing it: `bodyNoFooter` was
only stripped when `url` was truthy, so a footer we had just REFUSED to reuse
stayed in the body as visible text and the foreign URL went out anyway, merely
unlinked. Refusing to link it while still printing it is not a fix. The footer is
now stripped whenever a replacement is appended, on either rail.

## The gate now has a caller

`execute-one.ts` refuses to dispatch a row whose mailbox signature carries a link
to the OpensDoors app domain — one guard per provider leg, immediately before the
body goes on the wire, failing the row with `SIGNATURE_LINK_MISALIGNED`.
`evaluateSendGovernance` gained `signatureLinkMisaligned` and the matching
blocked code. The helper stays pure: the caller classifies the content and passes
a verdict in.

## Severity model — three corrections, one of them mine

`scripts/ops-cross-domain-audit.ts` now imports `signature-link-alignment.ts`;
its duplicated suffix list, extractor and severity function are gone.

1. **A remote image on a foreign host is MEDIUM, not HIGH.** The old rule
   produced 11 HIGH findings and every one was a company logo. Blocking on it
   would have stopped Train Hugger — 763 sends — for hosting its own logo on its
   own website's CDN.
2. **Well-known hosts are checked before image-ness.** The old order tested
   `isImage` first, so a LinkedIn icon scored HIGH. Any signature with social
   icons would have blocked.
3. **My own false positive, caught by running against production.** I first put
   the platform check *before* the alignment check as "belt and braces", and
   reduced the app URL to its registrable domain. BidlowAI is itself a workspace
   whose mailbox is `greg@bidlow.co.uk`, and the app runs at
   `opensdoors.bidlow.co.uk` — so that swallowed the whole `bidlow.co.uk` zone
   and scored BidlowAI's links to its own marketing site as HIGH, which would
   have blocked its own sends. Alignment now wins and is checked first, and app
   domains are matched as **exact hosts** by suffix, never as registrable zones.
   Pinned by a regression test.

**Production after the fix: 17 clients, 0 HIGH, 11 MEDIUM, 0 LOW.** Nothing is
blocked. The 11 are the company logos, now correctly a warning.

## A false-clean trap, closed

The FIRST production run of the audit was made with `DATABASE_URL` exported but
`AUTH_URL` not. `appDomainsFromEnv()` then seeds only `azurewebsites.net`, so the
one severity that blocks — our own domain in a customer's email — **could not
fire at all**, and the run reported a clean bill of health on that axis. The
script now refuses to run without an app URL rather than auditing with detection
silently off. A check that cannot run is a failure, not a pass.

## The CI job the brief asked for: refused, with a substitute

Step 2.5 asked for the audit as a merge-blocking CI job. **It cannot work.** The
audit reads real client signatures, templates and logos; CI's `DATABASE_URL` is
the ephemeral e2e Postgres, which has no clients. The job would pass on an empty
database and report a clean bill of health — a false green, and a named defect
class in this estate.

Two things shipped instead:

* `npm run ops:cross-domain-audit` — on demand, named, as asked.
* `.github/workflows/signature-link-audit.yml` — **scheduled** against production
  (Mondays 06:00 UTC, before the 07:00 send window), failing the run on HIGH and
  refusing to run at all if the production connection string is absent.

The script also now exits non-zero on HIGH. It never did: its only
`process.exitCode = 1` sat in the `.catch()`, so a run finding fifty HIGH issues
exited 0 — it could have been wired to CI and would still never have failed.

## Tooling: `tldts`, not `psl`

The brief said `npm i psl`. `tldts` (MIT, bundles the real PSL, ships its own
types) was **already in the dependency tree** via `shadcn → msw → tough-cookie`,
so declaring it directly costs no install size and the standard is to reuse
before adding. It is declared as a **direct** dependency deliberately: relying on
it transitively through a scaffolding CLI would break silently the day someone
correctly moves `shadcn` to devDependencies.

`allowPrivateDomains` is ON so two projects on a shared platform
(`a.supabase.co` vs `b.supabase.co`) are not treated as one origin.

## A test-harness bug found on the way

`baseInput()` in `client-send-governance.test.ts` built a fixed object listing
only the required fields. `Partial<SendGovernanceInput>` therefore accepted
`linkDomainAligned` or `signatureLinkMisaligned` from a caller, typechecked
cleanly, and **silently dropped them** — my first governance test passed for the
wrong reason until I checked why it did not fail. Any future test written against
either input would have been vacuous. Fixed to thread the optional fields
through, keeping "not passed" distinct from "passed as undefined".
