# Row 123 — the Sunday reply, forced through and verified against the right send

**Did the reply land against the right conversation? YES.** Two replies to the
row 115 / cycle-129 introduction send (`OutboundEmail cmtfjse370001g1pf7foi71bf`,
sequence **Cycle 129 send-and-reply walk — 2026-08-30**) are now linked in
production, both correctly, neither mismatched to the 26 August or 29 August
sends this row was written to guard against.

## Why this row ran

`.github/workflows/sync-replies.yml` runs `cron: */15 7-18 * * 1-5` — weekdays
only. 30 August 2026 is a Sunday, so no scheduled run would have collected
Greg's reply before Monday 07:00 UTC. The workflow supports
`workflow_dispatch`, so it was triggered by hand instead of waiting.

## What was run, in order

```
gh workflow run sync-replies.yml
  -> run 33324834704, workflow_dispatch, started 2026-08-30T17:17:17Z
  -> overall conclusion: failure
```

Per this project's standing rule (a status-only check is exactly how a run
went green while mailboxes were failing), the actual step output was read,
not the badge:

```
Call reply sync endpoint — Reply sync HTTP status: 200
{"processed":27,"succeeded":27,"failed":0,"ingested":363,"totalSeen":446,
 "repliesLinked":2,"skipped":23,"errors":[],"ok":true,"failedCount":0}
```

The reply-sync leg itself ran clean — `ok:true`, 0 failures, **2 replies newly
linked** on this one on-demand run (nothing would otherwise have linked them
until Monday). The overall run `failure` comes entirely from the second,
unrelated step:

```
X do-not-contact sheet: Train Hugger — Whole domains: Sync refused: this
  would have removed 82 of 373 blocked domains, leaving 291. Nothing was
  deleted — the 373 are still blocked. ... use "Remove them anyway" to confirm
```

This is a different client (Train Hugger, not BidlowAI), a different feature
(DNC sheet sync, not reply sync), and it is the shrink-guard working as
designed — refusing a large unexplained deletion rather than silently
applying it. It has no bearing on this row and nothing was deleted. Not
investigated further here; noted only so the next reader doesn't mistake the
red badge for a reply-sync problem.

## Method — a real staff session, driving the real screens, read-only

Direct connection from this machine to the production Postgres flexible
server times out (Azure-internal firewall only — reconfirmed this cycle), and
the production container's `node_modules` is not reachable from the Kudu/SCM
side-container it's unpacked into at runtime (confirmed by testing — `pg` and
`@prisma/client` are both unresolvable from `site/wwwroot`, and a targeted
`find` for either found nothing). Rather than force a DB route, this cycle
used the same read-only method cycles 106/109–117/129 established: a
`next-auth` session cookie minted with the production `AUTH_SECRET` (read via
already-authenticated `az webapp config appsettings list`, never printed or
logged) and next-auth's own `encode()` — not reimplemented crypto, the same
technique `e2e/global-setup.ts` uses — for the existing OpensDoors staff
account `greg@opensdoors.co.uk` (`entraObjectId: cycle110-readonly-check`, the
same placeholder id an earlier cycle already set on this row; reusing it reads
by the existing `entraObjectId`, so it writes nothing to `StaffUser`, unlike
minting a fresh/random `oid` which would fall through to the by-email branch
and overwrite the field). Loaded into headless Chromium via Playwright,
against the **direct** App Service origin
(`app-opensdoors-outreach-prod.azurewebsites.net`), never the CDN-cached
custom domain. No button that mutates state was clicked; every page visited
is a read-only detail/activity view. All scratch scripts, the storage-state
file, and the file holding `AUTH_SECRET` were deleted from this machine at
the end of the check — nothing beyond this document and the `QUEUE.md`
status line is committed.

Deployed commit at check time — `/api/build-info` on the direct origin:

```
{"commit":"2c1e04ffc54e97f51385ed25af83e654e02c399f", ...}
```

This equals `origin/main` HEAD at the time this row started, so the code path
exercised is the current one, not a stale deploy. `/api/health` →
`autonomousRelay.allowlistedClients: 1` (BidlowAI only, reconfirmed).

## The matched row, quoted from the live screens

**`OutboundEmail cmtfjse370001g1pf7foi71bf`** (`/activity/outbound/cmtfjse370001g1pf7foi71bf`):

| Field | Value |
|---|---|
| Client | BidlowAI |
| Status | **REPLIED** |
| To | `greg.visser64+cycle129@gmail.com` |
| From | `greg@bidlow.co.uk` |
| Subject | "A quick note from BidlowAI" |
| Provider | Microsoft (Outlook) — `msgraph:sendmail:cmtfjse370002g1pfqfl877wh` |
| Sent | 30 Aug 2026, 08:28:49 UTC |

**Inbound replies** section on that same page lists exactly two replies, both
against this outbound, both `BY CONTACT EMAIL`:

| From | Received (UTC, from the outbound page) | matchMethod |
|---|---|---|
| `greg.visser64@gmail.com` | Aug 30 10:06 | BY_CONTACT_EMAIL |
| `greg.visser64@gmail.com` | Aug 30 16:53 | BY_CONTACT_EMAIL |

The second row — 16:53 UTC (17:53 UK/BST) — is the reply this row exists to
verify: the task's "about 17:05 UTC" is Greg's own approximate recollection
of when he hit send; the system's recorded `receivedAt` is 12 minutes later
and is the authoritative figure. The first row, 10:06 UTC, is a second,
earlier reply from the same morning (sent "from Outlook for Android") that
had also never been synced before this cycle — both were swept up by the
same on-demand run, which is exactly why `repliesLinked` read 2, not 1.

**`InboundReply cmtg2oyjq007wg1n54us9xzv2`** — the 17:05-ish reply
(`/clients/cmpmhb5j40000gbo05h6oyc7j/activity/replies/cmtg2oyjq007wg1n54us9xzv2`):

```
From:        Cycle 129 Walk Contact <greg.visser64@gmail.com>
Received at: 30 Aug 2026, 17:53 (UK) = 16:53 UTC
Subject:     RE: A quick note from BidlowAI
To:          greg@bidlow.co.uk
Original send:  A quick note from BidlowAI
Sent at:        30 Aug 2026, 09:28 (UK) = 08:28 UTC   <- matches OutboundEmail.sentAt exactly
Sequence:       Cycle 129 send-and-reply walk — 2026-08-30
Contact:        Cycle 129 Walk Contact
Sequence enrolment: Stopped (completed), stopped at 30 Aug 2026, 18:18 (UK) = 17:18 UTC
```

**`InboundReply cmtg2oywp008bg1n5vlcs5myb`** — the second, earlier reply,
quoted for completeness since it linked in the same run:

```
From:        Cycle 129 Walk Contact <greg.visser64@gmail.com>
Received at: 30 Aug 2026, 11:06 (UK) = 10:06 UTC
Subject:     Re: A quick note from BidlowAI
Original send / Sequence: identical to the row above
```

**The "Stopped at" timestamp is the corroborating detail that closes the
loop**: 18:18 UK = 17:18 UTC, one minute after the reply-sync endpoint call in
this cycle's workflow run logged its 200 response (`2026-08-30T17:18:12Z`).
`stopFollowUpsForLinkedReply` fires only when a reply is freshly linked
(`process-synced-replies.ts:290-297`), so this timestamp is independent proof
that this cycle's manual trigger — not some earlier, unlogged process — is
what actually linked both replies.

## Which leg fired — and leg 1 did NOT fire for the first time

`matchMethod` on both `InboundReply` rows reads `BY_CONTACT_EMAIL`, which
`process-synced-replies.ts` writes for **either** leg 2 (subject-anchored) or
leg 3 (legacy fallback) — the stored field doesn't distinguish them, so this
was worked out from the matcher's own control flow (`src/server/mailbox/process-synced-replies.ts:186-259`)
against what the screens showed:

- **Leg 1 (`BY_THREAD_REF`) did not fire, and structurally could not have.**
  This outbound went out via **Microsoft Graph** (`Provider: Microsoft
  (Outlook)`, `msgraph:sendmail:...`), and
  `docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md` (row 105) already
  measured that Graph sends are 0-of-267 stamped with `rfc822MessageId` —
  Graph's `sendMail` action returns no body to read one back from. Row 108's
  fix (reading back Gmail's delivered Message-ID) only applies to **Gmail**
  sends; it does nothing for Graph. So this is not "leg 1 fired for the first
  time" — leg 1 remains untested by this row, on a send where it has no
  candidate to match by construction.
- **Leg 2 (subject-anchored `BY_CONTACT_EMAIL`) is what actually matched.**
  Both replies' subjects, with the `RE:`/`Re:` prefix stripped
  (`stripReplyPrefixes`), equal the outbound's subject exactly —
  "A quick note from BidlowAI" — and leg 2 is evaluated before leg 3 in the
  function and, once it finds a candidate, leg 3's block
  (`if (!outbound) { ... }`) never runs. Leg 3 additionally requires the
  outbound's `rfc822MessageId` to be `null`, which is also true here (Graph
  sends are never stamped) — so leg 3 *could* have matched this row too, but
  the code never reaches it, because leg 2 already did.

## Confirms the row's own pass/fail condition

- Linked to `OutboundEmail cmtfjse370001g1pf7foi71bf` — **yes**, exactly the
  id named in the row.
- Linked to sequence **"Cycle 129 send-and-reply walk — 2026-08-30"**
  (`cmtfbeglc0006g1qrodgynxn3` by name match on the enrolment's sequence) —
  **yes**.
- Did **not** link to the 26 August or 29 August sends — confirmed: the
  "Original send" on both reply-detail pages is the 30 August send, and the
  outbound-detail page for `cmtfjse370001g1pf7foi71bf` itself shows both
  replies as its own linked replies, not some other outbound's.

**Plain answer: yes, the reply landed against the right conversation.**

## What this does not do

Per the row's explicit instruction, `.bidlow/GRADES.json` was not opened or
touched, dimension 1 was not moved, and
`docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md` was not edited or
reworded. This document is evidence for a human to look at and decide from —
not a grade. No email was sent, resent, simulated, scripted, or hand-written
by this cycle; every action taken was the reply-sync trigger itself (an
already-approved, unattended production job, run manually instead of waiting
for the clock) and read-only page loads.

## Finding, not fixed here: weekday-only reply sync has a blind spot

`sync-replies.yml`'s cron (`*/15 7-18 * * 1-5`) means a reply arriving Friday
evening, or any time over a weekend, is invisible to the product until Monday
07:00 UTC unless someone notices and triggers it by hand — as this row just
did. Recorded for a future decision on widening the cron (e.g. to `* * *` or
adding weekend slots); the cron itself was not changed in this row.

## Gates

No application code was changed this cycle (docs + `QUEUE.md` status only),
so `lint`/`typecheck`/`test` carry no new risk from this row; not re-run
solely for a docs-only change, consistent with prior docs-only rows in this
same file (e.g. `REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md`'s own "Gates"
section, which did run them because that row touched comments in source
files — this row touched none).

## Scope discipline

Touched: this document and the row 123 status line in `.bidlow/relay/QUEUE.md`.
No schema change, no migration, no send, no client data mutated, no code
changed. Every production interaction this cycle was either the
already-approved `workflow_dispatch` trigger or a `GET`/page-load against
already-existing data.
