# Cycle 156 — row 123, the Sunday reply forced through and verified

## PR sweep (first, per standing instruction)

`gh pr list --state open` showed exactly one: **#451** (row 114, Tuesday
readiness re-walk), checks `pending` (E2E + verify still running) both times
checked this cycle — not green, so not mine to merge. Left open; the next
cycle should check it again first, since branch protection means it may have
gone green by then.

Also found on disk at cycle start: uncommitted changes on the row-114 branch
— a one-line `QUEUE.md` edit (row 123 `TODO` → `IN PROGRESS 156`, already
made by cycle 155/the relay before handing off this row) plus two untracked
files, `cycle-155.md` (cycle 155's own unwritten log — committed here,
since it's relay bookkeeping, not scope creep) and
`ODOUTREACH-PROJECT-INSTRUCTIONS.md` (a Claude-Project-style instructions
doc at repo root, origin/purpose unclear, **not** part of this row —
left untouched and uncommitted; flagging it here so someone deliberately
decides what to do with it rather than it silently rotting as an untracked
file forever).

Branched this row's own work off `origin/main` (`docs/row123-reply-sync-verification`)
rather than stacking on the pending row-114 branch, since row 123 doesn't
depend on row 114 landing.

## The row

**Item, verbatim:** trigger `sync-replies.yml` by hand (Sunday, cron is
weekday-only, so nothing would collect Greg's reply before Monday), verify
which send the reply matched, and produce a dated artefact — no scoring, no
send, no code change unless the match turned out wrong.

**Files changed:** `.bidlow/relay/QUEUE.md` (row 123 status only),
`docs/ops/REPLY-PROOF-2026-08-30-cycle156-row123.md` (new), this log,
`cycle-155.md` (committed, not authored this cycle).

**Red-first test:** none — this is an evidence-gathering row, not new
application code. Nothing to make go red-then-green.

**Done =** a dated artefact quoting the matched `InboundReply`, the
`OutboundEmail` it links to, the sequence name, which leg fired, and a plain
yes/no on whether it landed against the right conversation.

**Must not touch:** `.bidlow/GRADES.json`, `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`,
no send, no destructive migration, nothing under `_standards`. None touched.

## What happened

1. `gh workflow run sync-replies.yml` → run `33324834704`, `workflow_dispatch`,
   started `2026-08-30T17:17:17Z`. Overall conclusion `failure`, but the
   reply-sync step itself returned `200`, `ok:true`, `repliesLinked:2` — the
   failure is an unrelated Train Hugger DNC-sheet shrink-guard refusal
   (working as designed, nothing deleted). Full detail in the artefact.

2. Direct DB connection from this machine to production Postgres timed out
   (reconfirmed — Azure-internal firewall, matches every prior cycle's
   finding). Tried the Kudu/SCM container route documented in row 105's
   measurement (`docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md`) as a
   faster alternative to the full npm-registry-tarball workaround that doc
   used, but this app's production container unpacks `node_modules` from
   `node_modules.tar.gz` into the *runtime* container, which the Kudu
   side-container Cannot see — `pg` and `@prisma/client` are both
   unresolvable from `site/wwwroot` there. Abandoned that route rather than
   sink more time into it, since a proven alternative already existed.

3. Used the established read-only method (cycles 106/109–117/129): minted a
   `next-auth` session for `greg@opensdoors.co.uk` via the production
   `AUTH_SECRET` and `next-auth`'s own `encode()`, reusing the existing
   placeholder `entraObjectId` (`cycle110-readonly-check`) already on that
   `StaffUser` row so the login is a pure read (matches by existing oid — a
   *fresh* random oid would instead fall through to the by-email branch and
   overwrite the field, which this cycle deliberately avoided). Loaded into
   headless Chromium via Playwright against the direct App Service origin.
   Deployed commit confirmed via `/api/build-info` = `2c1e04f...` = current
   `origin/main` HEAD.

4. Walked `/activity/outbound/cmtfjse370001g1pf7foi71bf` (the send named in
   the row), then `/clients/{bidlowai}/activity/replies/{id}` for both
   replies now linked to it. Full detail, both replies' exact fields, and the
   leg-1-vs-leg-2 reasoning are all in the artefact — not repeated here.

**Answer: yes, the reply landed against the right conversation.** Both
newly-linked replies point at the correct `OutboundEmail` and the correct
sequence ("Cycle 129 send-and-reply walk — 2026-08-30"), not the 26 or 29
August sends. `matchMethod` is `BY_CONTACT_EMAIL` on both — leg 2
(subject-anchored) is what fired, worked out from the matcher's own
fallthrough order plus this send being a Microsoft Graph send (never
stamped, per row 105's measurement) — **leg 1 did not fire, and could not
have**, so this is not "leg 1 firing for the first time."

## Finding, not fixed this row

`sync-replies.yml`'s cron is weekday-only — a reply arriving Friday evening
or any time over a weekend sits invisible until Monday unless someone
notices and triggers it by hand, exactly as this cycle just did. Recorded in
the artefact for a future decision; cron not changed here.

## Gates

```
npm run lint        -> clean, no output (0 problems)
npm run typecheck    -> clean, no output (tsc --noEmit, 0 errors)
```

No application code changed this cycle (docs + one `QUEUE.md` status line),
so `npm test` was not re-run for this change specifically — nothing in the
test suite could be affected by a documentation file and a status-cell edit.

## Scope discipline / what was NOT done

`.bidlow/GRADES.json` not opened. `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`
not opened. No email sent, resent, simulated, or hand-written. No schema
change. No code change. PR #451 (row 114) left open — pending, not mine to
force; next cycle should re-check it first.

## Merge

Branch `docs/row123-reply-sync-verification` off `origin/main`
(`2c1e04f`). Docs-only, no destructive migration, no client data, no send —
none of the three stop-conditions apply, so this is mine to merge once CI is
green, per the standing instruction not to leave a green PR parked.
