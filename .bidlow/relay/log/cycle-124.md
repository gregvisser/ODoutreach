# Cycle 124 - queue item 100

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it.

## PR sweep at cycle start

`gh pr list --state open` returned zero open PRs. Nothing to merge, nothing
to comment on.

## What was found on disk before touching anything

`git status` at session start showed the same shape prior cycles have
documented as legitimate prior record, not stray work: uncommitted
modifications to `.bidlow/relay/QUEUE.md` (row 100's status cell already
flipped from `TODO` to `IN PROGRESS 124` — the picker's own dispatch marking)
and `.bidlow/relay/log/cycle-123.md` (the watcher's own automatic
end-of-cycle appendix for cycle 123, never committed), plus the untracked
`ODOUTREACH-PROJECT-INSTRUCTIONS.md` several prior cycles have correctly left
alone (a document meant for a different tool's project settings, not repo
code). Carried forward in this cycle's commit rather than discarded or redone.

## Before touching anything: the four things

1. **Files to change:** `src/lib/normalize.ts` (+ its test file),
   `src/server/mailbox/process-synced-replies.ts` (+ its test file), and a
   dated artefact under `docs/ops/`. Discovered during the cycle that one more
   test file (`src/server/mailbox/reply-optout-body.test.ts`) also mocks
   `prisma.outboundEmail` directly and needed the same mock update — no
   behavioural assertions in it changed.
2. **The red-first test:** a new case in `process-synced-replies.test.ts`
   reproducing the real production shape (an older send to the bare address,
   a newer send to the same mailbox with a `+tag` alias, and a reply whose
   `From` matches only the bare form) — asserted it must link to the NEWER
   send. Ran it against the unmodified matcher first and watched it fail
   (`expected false to be true`), quoted verbatim in the artefact.
3. **Done means:** the matcher links a Gmail plus-alias reply to the correct
   (newest) send instead of an older bare-address one, proven by a red-then-green
   test — NOT that dimension 1 moves or the sell gate opens, which this row's
   own text explicitly forbids claiming.
4. **Not to touch:** `.bidlow/GRADES.json`, any dimension score, the sell
   gate, any schema/migration, any send, any client data (the two production
   reads were SELECTs only).

## What was measured before changing anything

Read the two named `OutboundEmail` rows and the one `InboundReply` row
straight from the production Postgres database, read-only. Direct connection
from this machine timed out (the flexible server's firewall only allows
Azure-internal IPs), so the query ran from inside the App Service's own
Kudu/SCM container instead — same network the app itself runs on,
`DATABASE_URL` read from that container's own environment (never printed
outside the query's own output), `pg` installed fresh into `/tmp` there for
the one query and everything deleted afterward. Full queries, results and the
mechanism analysis are in `docs/ops/REPLY-MATCHER-PLUS-ALIAS-FIX-2026-08-30.md`.

**Finding that changed the plan:** both competing sends have
`rfc822MessageId: null` — not because of anything Gmail-specific, but because
the sending mailbox (`greg@bidlow.co.uk`) is Microsoft Graph, which this
codebase doesn't stamp. That rules out mechanism (ii) as the cause of this
specific incident (leg 3's null-only exclusion never had a stamped send to
exclude here) and confirms mechanism (i) — the plus-alias drop defeating
leg 3's literal `toEmail` equality — as the one that fired. Said so plainly
rather than treating both as equally responsible.

## The fix

Kept it schema-free, per the row's own preference to avoid a migration unless
genuinely needed. Legs 2 and 3 of `processSyncedMessageForReply` now fetch
candidates via `findMany` on every existing safety constraint except the
literal `toEmail` equality (client, mailbox, sentAt, status, and leg 2's
subject match all unchanged), then compare the recipient canonically in code
using a new `canonicalizeEmailForMatching` (`src/lib/normalize.ts`, built on
the existing `normalizeEmail`) against the already-`sentAt desc` array, so
"most recent wins" survives once more than one candidate matches
canonically. No constraint was widened or dropped — a stranger's mail still
cannot attribute to a prospect.

## Gates, run and shown

```
npm run lint       → 0 problems
npm run typecheck  → 0 errors
npm test           → 348 files, 3655 tests passed (was 3649 before this cycle)
npm run build --webpack → succeeded, full route manifest printed
```

## Status

Row 100: `DONE 124`. Full evidence, the exact SQL, the red-first failure
output and the design rationale are in
`docs/ops/REPLY-MATCHER-PLUS-ALIAS-FIX-2026-08-30.md`. `.bidlow/GRADES.json`,
dimension 1 and the sell gate were not touched — the row's own text is
explicit that fixing the matcher does not by itself observe the journey, and
this cycle did not claim that it did.
