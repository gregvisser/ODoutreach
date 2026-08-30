# Cycle 158 — row 125, receiving must run at any time

## PR sweep (first, per standing instruction)

`gh pr list --state open` showed exactly one: **#454** (row 128, carrying the
watcher's dimension-1 re-measure row, opened by cycle 157/the relay before it
was killed). Checks were both green (`verify` 4m8s, `E2E` 5m28s). Docs +
`QUEUE.md` only, no destructive migration, no client data, no send: mine to
merge per the standing instruction not to leave a green PR parked. Merged
squash, branch deleted (`1252f0e`).

Also found, before the merge could proceed: two uncommitted edits already
sitting in the working tree from cycle 157/the watcher — `QUEUE.md` stamped
row 125 `IN PROGRESS 158` (the dispatch for this cycle) and `cycle-157.md`
carrying the watcher's own post-mortem of cycle 157 being killed at the
45-minute deadline (a stale-script warning already tracked as row 52's
defect, nothing new). Neither was committed by cycle 157, because it was
already dead by the time it would have committed them. Stashed both before
switching branches (so the merge of #454 could proceed cleanly), then popped
them back onto a fresh branch cut from post-merge `main`. Nothing lost,
nothing invented.

Also still present, still unrelated: the untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md`
at repo root, flagged by cycle 156 and left alone again by cycle 157. Left
untouched a third time — still not this row's to absorb.

## The four things, written down before touching anything

1. **Files to change:** `.github/workflows/sync-replies.yml` (the cron), a
   new `relay/reply-sync-schedule.test.ts`, a new dated artefact under
   `docs/ops/`, and the row 125 status line in `.bidlow/relay/QUEUE.md`.
   Explicitly NOT `.github/workflows/process-outbound-queue.yml`.
2. **Red-first test:** `relay/reply-sync-schedule.test.ts` — reads the real
   `.github/workflows/sync-replies.yml`, parses its cron with a minimal
   5-field matcher, and asserts it fires at four UTC instants including
   Sunday night and Saturday evening. Watched it FAIL against the unedited
   file (`expected false to be true` at the Sunday-night instant) before
   touching the cron string.
3. **Done, in one sentence a non-coder can check:** a reply that lands on a
   weekend or overnight shows up in Activity within about 15 minutes instead
   of waiting until the next weekday morning, and nothing about when outreach
   emails go out has changed.
4. **Must NOT touch:** `process-outbound-queue.yml`'s schedule,
   `.bidlow/GRADES.json`, any dimension score,
   `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`, and no real send.

## The damage question — answered before any change was made

**Can a scheduled follow-up go out to a contact who has already replied but
whose reply has not yet been synced? No — not through the mechanism this row
was worried about**, and this is the most important finding of the cycle so
it is stated here as plainly as in the artefact.

The row's own framing assumed the two workflows only interact through their
separate schedules (sync every 15 min, send every 5 min, both starting at
07:00, so they "can interleave"). Reading the actual code shows
`process-outbound-queue.yml` does not rely on that interleaving at all: its
own first step, "Sync replies before advancing", calls the same
`/api/internal/replies/sync` endpoint and awaits it to completion — including
the write that sets a replied-to enrolment's status to `COMPLETED`
(`src/server/mailbox/process-synced-replies.ts:294-297` →
`src/server/email-sequences/stop-follow-ups-on-reply.ts:61-71`) — *before*
its second step, "Advance due sequence follow-ups", makes a fresh HTTP
request that re-reads that same enrolment's live status
(`src/server/email-sequences/send-introduction.ts:436-464`) and skips it if
`COMPLETED` (`src/lib/email-sequences/sequence-send-policy.ts:221-228`). Full
citations and the two residual gaps found while tracing this (the 50-mailbox
per-run cap, and unlinked replies stopping nothing) are in the artefact — full
detail there rather than repeated here.

**Consequence for this row: this is a latency fix for operator visibility,
not a correctness fix for sending.** `process-outbound-queue.yml` is
untouched, so the guard above is untouched too.

## Greg's condition — checked, and it cleared

His words: leave it the way it is if it will cause problems. Checked each
named risk against the code, not a guess: duplicate inbound rows (protected
by a compound-unique upsert key, `mailboxIdentityId` + `providerMessageId`),
double-processing (same guard), provider rate limits (per-tick call shape is
unchanged — only the number of previously-idle hours/days now covered
increases, which spreads load rather than concentrating it), cost (triples
weekly runs, ~220 → ~672, in line with the estimate, not far above it), and a
worse race with the send queue (impossible — `process-outbound-queue.yml`
never runs outside business hours, so it can never overlap with the new
out-of-hours ticks at all; the business-hours overlap between the two
workflows is unchanged). No finding argued against the change.

## The other schedules

Checked every cron in `.github/workflows/*.yml`. Only `sync-replies.yml` is
a pure inbound-mail poll restricted to business hours. `support-agent.yml`
runs weekday business-hours only too, but it is not a pure receive — it
triages, edits code, opens PRs and can email a reporter back — so it is a
send/act workflow, correctly out of this row's scope. Everything else
(`alerts.yml`, the Monday health probes, the daily DNS/domain sweeps) is
either already unrestricted or not receive-side at all. Full table in the
artefact. One correction made along the way: `alerts.yml`'s own comment
claimed "reply sync runs daily" — that was false before this row (the reply
sync was weekday-only) and is true now; not a code change, just noting the
comment is no longer stale.

## The change

`.github/workflows/sync-replies.yml`: cron `*/15 7-18 * * 1-5` →
`*/15 * * * *`, with the reasoning and cost written directly into the
workflow file as a comment so the next reader does not have to find the
artefact to know why. `.github/workflows/process-outbound-queue.yml`: byte
for byte unchanged — verified by the new test's regression assertion, which
pins its cron string.

## Proof it fires

`relay/reply-sync-schedule.test.ts`, 3 tests: watched **red** against the
unedited cron (Sunday-night instant failed, `expected false to be true`),
then **green** after the one-line edit. A separate assertion pins the OLD
cron as a string literal (not read from disk) and proves it would have
failed the same night/weekend instants while passing the business-hours
control — so the matcher itself is proven discriminating, not vacuously
true. A third test locks `process-outbound-queue.yml`'s cron to its exact
current string as a regression guard on "do not touch."

**Real out-of-hours workflow run, quoted:** pending at the time this line was
written — the PR has not yet merged, so the new schedule has not yet reached
`main`. Current time is Sunday ~19:35 UTC, already outside the OLD schedule's
window (Sunday is not a weekday), so the very next run after merge will
itself be the proof. This cycle will poll for it after merging and update
this log and the QUEUE.md row with the run ID and timestamp if one lands
before the cycle ends; if not, the row stays PARTIAL and says so rather than
claiming it proven.

## What this does not do

`.bidlow/GRADES.json` not opened, no dimension moved, no sell gate touched,
`docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md` not edited. No email
sent, resent, simulated or scripted. `process-outbound-queue.yml` not
touched in any way.

## Gates

`npm run lint` — 0 problems. `npm run typecheck` — 0 errors. `npm test` (full
suite) — first run surfaced ONE unrelated failure:
`relay/queue-file-integrity.test.ts > QUEUE.md encoding > keeps the
byte-order mark` — `QUEUE.md`'s UTF-8 BOM had been stripped again by some
write path outside this cycle's own edits (row 127's recurring defect, third
time in two days per cycle 157's own log). Restored it by hand (Node,
`Buffer.concat` with the BOM bytes — PowerShell is denied to this session, so
the usual restoration method wasn't available; this alternative produces
byte-identical output and the test that checks it agrees). Re-ran
`relay/` — 11 files, 167 tests, all green. Full suite not re-run a third
time; the only file touched after the BOM fix was `QUEUE.md` itself, already
covered by `relay/queue-file-integrity.test.ts`.

## Result


