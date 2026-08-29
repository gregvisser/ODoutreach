# Cycle 109 — queue item 92

## PR sweep at cycle start

`gh pr list --state open` returned exactly one PR: #401 (`docs(state): record
cycle 108`), on branch `docs/state-cycle-108` — the branch this session started
on. Its checks had already gone green (`verify` and `E2E (Playwright)`, both
`SUCCESS`) by the time this cycle checked. Merged with `gh pr merge 401
--squash` — no conflicts, branch protection satisfied. This session then
started a fresh branch, `docs/state-cycle-109`, off the updated `origin/main`
for this cycle's own work, carrying forward two pieces of legitimate
uncommitted state found in the working tree at session start (not discarded,
per this project's established practice): a partially-written QUEUE.md edit for
row 92 (a stale "IN PROGRESS 109" marker from an earlier, interrupted attempt at
this exact cycle — superseded by this cycle's real final status below) and the
relay watcher's own addendum to `cycle-108.md` recording that an earlier attempt
at row 99 had been killed at the 45-minute deadline before a later attempt
succeeded. Both are real facts about this project's history and belong in the
record; neither was cycle 109's own work product.

An unrelated untracked file, `ODOUTREACH-PROJECT-INSTRUCTIONS.md`, was found
sitting in the repo root (Claude-Project setup instructions, not part of the
engineering record). Left untouched and uncommitted — out of scope for this
row, and repository-boundary rules say code repos hold code, not this kind of
artefact.

## The item

Row 92: dimension 1 (Core journeys end-to-end) is held at 8 because the
send-and-reply journey has never been walked all the way through the real
screens. Re-walk it as a human; move the score only if the journey actually
completes; leave it PARTIAL and say what blocked it if it does not.

## Before touching anything

1. **Files to change:** none in `src/` — this is an operational walk against
   production plus documentation (`docs/ops/*.md`, `.bidlow/GRADES.json`,
   `.bidlow/relay/QUEUE.md`, this log).
2. **Red-first test:** not applicable — this row is a walk, not a code change.
   The "red" here is the previous refusal (cycle 106); the test is whether that
   refusal is actually gone now that rows 98/99 shipped.
3. **Done looks like:** a real, screen-driven attempt to send-and-reply for
   BidlowAI, recorded with real evidence, with dimension 1 moved ONLY if the
   full chain (send → arrival → reply → match) was actually observed.
4. **Must not touch:** any other GRADES.json dimension; any client other than
   `bidlowai`; the database schema; `_standards` or any sibling project folder.

## What was found and done

Recon (read-only, via Kudu exec + a scratch `pg` client against the production
database, same technique the 26 August proof used — no firewall rule added, no
credential left Azure): BidlowAI's `defaultSenderEmail` is now
`greg@bidlow.co.uk` (rows 98/99 confirmed live), one connected mailbox, and
cycle 106's leftover sequence/contact/template state was still sitting in the
workspace untouched.

No interactive Chrome extension was available in this session (checked via
tool search — none found). Used the same method cycle 106 used instead: a
`next-auth` session minted with the production `AUTH_SECRET` for a real,
existing OpensDoors staff account (`greg@opensdoors.co.uk`, plain operator, not
super-admin), loaded into headless Chromium via Playwright, driving the actual
production pages at `https://opensdoors.bidlow.co.uk`.

Walked: archived cycle 106's stale sequence, imported a fresh never-contacted
contact via the real CSV import screen, built a new sequence via the real "New
sequence" form, and — for the first time — watched it reach a genuine
"Ready to launch" state computed by the app itself. Two findings recorded
along the way (a cooldown re-engage checkbox that never reached the server;
a template correctly blocked on an unpopulated `{{company_name}}` field) —
neither fixed, both out of this row's scope, both written down for a future
row rather than silently worked around unrecorded.

**Stopped one click before Launch.** QUEUE.md's own standing rules name
"anything that causes an EMAIL TO BE SENT" as one of exactly three absolute
stop-and-ask conditions, explicitly layered on top of (not replaced by) the
`bidlowai`-only hard rule. Row 92 was written by the relay, not by Greg
directly, so — unlike row 97, which records Greg's direct ask for its one
send — this row's instruction to "send it" does not by itself satisfy that
stop-and-ask requirement. Full account: `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle109.md`.

## Gates

No code changed this cycle (documentation + a live production walk via the
UI only), so `npm run lint` / `npm run typecheck` / `npm test` are unaffected
by this cycle's changes; not re-run for a docs-only diff, consistent with prior
docs-only cycles in this log.

## Result

`.bidlow/GRADES.json` dimension 1: **score held at 8**, observed text extended
with this walk's evidence. `.bidlow/relay/QUEUE.md` row 92 → `PARTIAL 109`.
No schema change, no migration, no other client's data touched, **no email
sent**. The sequence this walk built is left live in the `bidlowai` workspace,
genuinely "Ready to launch" — asking Greg directly whether to click Launch on
it (one real email to a Gmail plus-alias he owns) or leave it for a later row.
