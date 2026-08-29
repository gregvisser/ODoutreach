# Cycle 112 — queue item 92

## PR sweep at cycle start

`gh pr list --state open` returned exactly one PR: #404 (`docs(relay): row 92
- send proven live by Greg, reply ingested but mismatched`), the PR cycle 111
opened. Checks were pending when first checked; re-checked a few minutes later
— both `E2E (Playwright)` and `verify` `pass`. Merged with
`gh pr merge 404 --squash` — no conflicts, branch protection satisfied. No
open PRs remained afterward. Rebuilt this cycle's branch (`docs/state-cycle-112`)
off the updated `origin/main`, carrying forward the two pieces of legitimate
uncommitted state already sitting in the working tree at session start (not
this cycle's own work product): the relay watcher's own addendum to
`cycle-111.md`, and the `IN PROGRESS 112` dispatch marker on row 92.

The untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` in the repo root was found
again, exactly as prior cycles found it. Left untouched — a Claude-Project
setup artefact, not part of the engineering record, out of scope for this row.

## The item

Row 92 again: dimension 1 (Core journeys end-to-end) held at 8. The brief text
redispatched to this cycle is byte-for-byte identical to cycle 111's — the
relay's PARTIAL-row redispatch, not a new instruction from Greg.

## Before touching anything

1. **Files to change:** none in `src/` — a read-only screen check plus
   documentation (`docs/ops/REPLY-PROOF-2026-08-29-cycle112.md`,
   `.bidlow/relay/QUEUE.md`, this log). `.bidlow/GRADES.json` explicitly NOT
   touched — held at 8, matching cycle 111's finding.
2. **Red-first test:** not applicable — an operational read-only walk, not a
   code change.
3. **Done looks like:** either new information about the reply-match state, or
   an honest statement that none exists this cycle and why, backed by a fresh
   check against the real screens rather than an assumption — recorded in a
   dated artefact.
4. **Must not touch:** any other GRADES.json dimension; any client other than
   `bidlowai`; the database schema; a second send; `_standards` or any sibling
   project folder.

## What was found and done

Recon first: is there anything actually new to observe, or is this an
identical-brief redispatch with nothing to add? Checked the two facts that
would matter — has any time passed in which the weekday reply-sync cron could
have run (no: still Saturday night UK time, cron is `*/15 7-18 * * 1-5`), and
has the underlying database state cycle 111 documented had any reason to
change since (no: no new send, no new cron run, nothing else touches
`InboundReply`/`OutboundEmail` linkage outside that sync). Concluded, before
doing anything expensive, that a full re-walk (cycle 110's precedent) or a
second manual sync trigger (which cycle 111 already used once, off-window,
for exactly this reply) would reproduce the identical already-known result.

What this cycle added instead: cycle 111's finding was proved by direct
database query (Kudu + a hand-rolled Postgres client, because `npm install`
was broken in that container). Row 92's own instruction asks for something
stronger — that the reply is "visible on the screens an operator actually
uses" — which had not actually been checked yet. This cycle minted a
read-only `next-auth` session for `greg@opensdoors.co.uk` (same technique as
cycles 106/109/110/111) and loaded, without clicking anything, the Cycle 109
sequence's own detail page and the client Activity page. Both confirm cycle
111's finding independently: the sequence shows recipient **PENDING**, Sent:
1, no "Replied" state; the Activity page's Replies panel shows the one
relevant reply, timestamped consistently with cycle 111's DB read, filed
against the 26 August send rather than today's — even though the reply's own
quoted body shows it was actually sent in reply to
`greg.visser64+cycle109@gmail.com`. Full account:
`docs/ops/REPLY-PROOF-2026-08-29-cycle112.md`.

No new reply arrived. No second send was made. No sync endpoint was
re-triggered.

## Gates

No code changed this cycle (documentation + read-only production screen
checks — no writes, no mutating clicks), so `npm run lint` /
`npm run typecheck` / `npm test` are unaffected; not re-run for a docs-only
diff, consistent with prior docs-only cycles in this log.

## Result

`.bidlow/GRADES.json` dimension 1: **score held at 8** — the mismatch cycle
111 found in the database is now also confirmed on the real operator screens,
which strengthens rather than changes the finding. `.bidlow/relay/QUEUE.md`
row 92 → `PARTIAL 112`. No schema change, no migration, no other client's data
touched, no second send. One dated artefact:
`docs/ops/REPLY-PROOF-2026-08-29-cycle112.md`.

A finding recorded but not acted on: this row cannot make further progress
until either Monday's weekday cron window opens, or a future attempt sends to
a plain, non-aliased address. Continuing to redispatch it every cycle between
now and Monday will keep reproducing this same near-zero-information result.
That is a relay/queue-management observation, not something this row's own
text authorizes fixing — written down for whoever next touches the watcher.
