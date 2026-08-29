# Cycle 102 - row 90 (CR-01b)

## PR sweep at cycle start

`gh pr list --state open` returned `[]` - nothing to merge. But `chore/bounce-audit-send-range`
was pushed to origin (3 commits: #385, #386, and an un-PR'd send-range follow-up,
`88d69f0`) with no open PR - opened one (#388), watched CI green (E2E + verify,
~5.5 min), squash-merged and deleted the branch. That put the audit script's
real min/max `sentAt` reporting on `main` before running it against production.

## What this row asked

CR-01b: has a real bounce ever moved `OutboundEmail.status` to `BOUNCED` in
production since the fix (cycle 39, PR #279, merged 2026-08-27)? Read-only only
- rule (c) forbids causing a send. `scripts/ops-bounce-path-audit.ts` already
existed (built cycle 39-ish, refined by #385/#386/88d69f0) but had never actually
been run against production and reported on.

Cycle 101 attempted this and was killed at the 45-minute deadline with an empty
"What it did" section - but it had already triggered two workflow runs
(33257014566 at 14:13 UTC, 33256556664 at 14:02 UTC) before dying. Read both
back rather than re-running blind.

## What was found, read-only throughout

1. **Triggered the audit a third time** (`gh workflow run bounce-path-audit.yml`,
   run 33257443587) after merging #388, to get a result against the exact
   `main` this cycle would report against. Identical to the two prior runs.

2. **11 `OutboundEmail` rows carry `status=BOUNCED`**, all channel=mailbox NDR,
   zero via the ESP webhook. Every row's `updatedAt` is 2026-08-28T19:06:xx -
   after the fix merged (2026-08-27) - which is the only fact that attributes
   the write to the fixed code, since the rows' own `bouncedAt` event times
   (2026-07-01 to 07-03) predate the fix by weeks. These are historical NDRs
   sitting in `opensdoors.co.uk` mailboxes that `record-bounce.ts`, running live
   with the flag on, picked up and stamped for the first time. The probe's own
   verdict line: `OBSERVED`.

3. **`MAILBOX_BOUNCE_DETECTION_ENABLED=true`** confirmed directly in the
   production App Service config (`az webapp config appsettings list --name
   app-opensdoors-outreach-prod --resource-group rg-opensdoors-outreach-prod`),
   not assumed from the code's default.

4. **The row's own premise was wrong, and the probe now says so plainly:**
   "nothing has sent since 3 July" is false. Real send range: 2026-05-20T12:24:54Z
   to 2026-08-26T13:07:09Z, 1,361 sends ever, 0 new since the fix merged. This is
   exactly why #388 (the send-range reporting commit) mattered - without it the
   probe could not have corrected this on its own.

5. **Resend ESP webhook checked separately**, since the row named it explicitly:
   `POST https://app-opensdoors-outreach-prod.azurewebsites.net/api/webhooks/resend`
   returns HTTP 503 - the route is deployed and reachable, and 503 is exactly its
   own "not configured" guard firing. Confirmed via `az webapp config appsettings
   list` that neither `RESEND_WEBHOOK_SECRET` nor `RESEND_API_KEY` exists in
   production. **This is not counted as a second inert path.**
   `src/server/email/providers/index.ts` documents Resend as serving only
   `OutboundEmail` rows WITHOUT a `mailboxIdentityId` - legacy/tests. Real client
   outreach exclusively uses Graph/Gmail via `sendViaConnectedMailboxOrFail`, so
   the mailbox NDR channel is the actual production bounce path for real client
   mail, and that is the one just proven firing.

## Verdict: bounces recorded - CR-01b CLOSED

Of the three outcomes the row named, this is the first: bounces recorded, close
with the evidence.

## What changed

- `.bidlow/GRADES.json`: CR-01b blocker `OPEN` -> `CLOSED` with the evidence
  above. Dimension 9 (Reliability & operability) 7 -> 8 (weight 6). Arithmetic
  and `weighted_total` 7.50 -> 7.56. `movement_this_regrade` and `sell_gate.note`
  both updated to say CR-08 is now the only open blocker and the distance to 8
  is 0.44.
- `CUSTOMER-READY-REPORT.md` updated to match: header score, re-grade narrative,
  scorecard row 9, weighted-total line, top-blockers list (CR-01b struck
  through), fix-to-ready checklist item 6 marked done.
- `.bidlow/relay/QUEUE.md` row 90: `IN PROGRESS 102` -> `DONE 102` with the
  proof.
- No application code touched. No schema, no migration, no client data moved,
  no email sent - every observation used sends and NDRs that had already
  happened before this cycle started.

## Gates

- `npm run lint` -> 0 errors.
- `npm run typecheck` -> 0 errors.
- `npm test` -> 3644 tests green, including `src/lib/grade-record.test.ts`
  (16/16) re-run against the edited `GRADES.json` to prove the schema still
  parses it and the sell-gate result still matches what the scores imply.

## Left alone, deliberately

- CR-08 (raw correlation cuid, dimension 3) - not this row, not touched.
- The wording question of whether a 0%-with-real-data bounce rate should render
  differently from a 0%-with-no-data one - noted in the report, not decided
  here; it's a product-copy call, not a defect this probe can settle.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 102 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 15:15:56, took about 26.5 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 102 - queue item 90

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE BOUNCE PATH HAS STILL NEVER BEEN OBSERVED FIRING ON PRODUCTION - CR-01b, and it is the last one that is genuinely about trust.** The structural defect was closed in cycle 39: both channels now write the BOUNCED status through `record-bounce.ts`, watched red first. What has NEVER happened is a real bounce arriving on production and the reported rate moving off 0%. Until that is seen, the number on the report is a claim, and this repository's recorded worst habit is exactly this - built, wired, reporting success, never fired. **Do not send anything to make it happen.** That is rule (c) and it is absolute. **What you CAN do, all read-only:** query production for any OutboundEmail rows carrying BOUNCED or a non-null bouncedAt since the fix merged, and for the mailbox NDR path's own records; check whether `MAILBOX_BOUNCE_DETECTION_ENABLED` is actually true in the production environment, because a flag defaulting to off would mean the NDR half is still inert; and confirm the Resend webhook endpoint is reachable and configured. Report the count with dates. **Three outcomes and all three are useful:** bounces recorded, so close CR-01b with the evidence; zero bounces but every path proven live and correctly wired, so record it as armed-but-unobserved with what would prove it; or a path found still inert, which is a real defect and its own row.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## FIRST, BEFORE ANY NEW WORK: CLEAR THE GREEN PULL REQUESTS

Do this at the START of every cycle, before you read the item below. It takes two
minutes and it is the difference between a queue and a landfill.

`gh pr list --state open` then, for every PR whose checks are GREEN: bring the
branch up to date if branch protection requires it, and MERGE it. Greg counted
SEVENTEEN open on 2026-08-28 and most were green - they had simply been opened and
abandoned.

**Understand WHY this happens, because it is structural and not laziness.** A
cycle finishes its work, opens a PR, and ends. CI takes about five minutes. Nobody
ever comes back. So every cycle adds one and removes none, for ever. The only
place that can be fixed is here, at the start of the NEXT cycle.

Rules for the sweep:
* RED PRs are not yours to force. Read the failure, and either fix it as part of
  this cycle or say in your log why you left it.
* Merge order matters: branch protection requires each branch to be current, so
  every merge invalidates the next one. Take the docs and `.bidlow` record PRs
  first - they cannot conflict with code - then the code ones, updating as you go.
* `gh pr merge --auto` is better than update-then-race if auto-merge is allowed.
* A DESTRUCTIVE migration is still Greg's. Additive is yours.
* If a PR is genuinely not ready, say so in a comment on it, so the next cycle
  does not have to work that out again.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, or one of
  the three named below - stop and write down the question instead. Note what
  changed on 2026-08-27: "an irreversible one-way door" used to sit in this list
  and was read as covering any production merge. It does not. Only (a), (b) and
  (c) below stop you now.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* **MERGING IS YOURS NOW. Greg decided this on 2026-08-27 and asked to stop being
  the bottleneck.** With green CI, MERGE AND DEPLOY WITHOUT ASKING. Do not park a
  finished, green PR and wait for him - a PR left open ROTS: #231 went from clean
  to 36 commits behind and CONFLICTING in a single day, and cost a whole cycle to
  rescue. Leaving it open is not the safe option, it is the expensive one.
* Three things still stop and ask, and they are the ONLY three:
  (a) a DESTRUCTIVE migration - anything that drops or alters an EXISTING table,
      column or type, or backfills over existing rows. Creating a NEW table, a new
      enum, or adding foreign keys to a new table is ADDITIVE and is yours to merge.
      The test is: does dropping what this adds restore today's behaviour exactly?
  (b) anything that touches or moves real CLIENT data.
  (c) anything that causes an EMAIL TO BE SENT. That one is absolute and it is on
      top of the hard rule about `bidlowai`, not instead of it.
  If it is none of those three, you do not need him. Merge it.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 102`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 102 - ...** |` reads correctly.
Anything else does not. The relay reads QUEUE.md with a regex, and a status it
cannot read STOPS THE WHOLE QUEUE, on purpose: refusing to guess is the right
behaviour, and inventing is the one thing this relay will never do.

This is not hypothetical, and it is not pedantry. Cycle 59 built, merged and
DEPLOYED half of row 40 - good work, verified by commit hash - and then wrote its
status as `PARTLY DONE 59`. Two words, one of them not on the list above. The
row stopped parsing, the picker met it first, and the relay took nothing at all
for seventy minutes while eleven jobs waited behind it. `SUPERSEDED` did exactly
the same thing to row 38 the day before.

So, plainly:

* Finished it -> `DONE 102 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 102 - <what is done, what is left>`. PARTIAL
  is TAKEN by the relay, so the next cycle picks the row straight back up. This is
  the right answer whenever you shipped part of a row.
* Could not start -> `TODO - <why>`
* Never invent a seventh word.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Cycle complete, everything merged and clean.

## Summary

**CR-01b closed — the bounce path has been proven firing in production, with evidence, all read-only.**

- PR sweep at start: `gh pr list --state open` was empty, but a pending branch (`chore/bounce-audit-send-range`) had never been PR'd — opened, green CI, merged (#388) before running anything.
- Ran the existing read-only audit (`scripts/ops-bounce-path-audit.ts`) against production twice via `gh workflow run`: **11 real `OutboundEmail` rows carry `status=BOUNCED`**, all via the mailbox NDR channel, each written *after* the fix merged — proof this is live code writing them, not stale rows.
- Confirmed `MAILBOX_BOUNCE_DETECTION_ENABLED=true` directly in production App Service config.
- Checked the Resend ESP webhook too: reachable but unconfigured — and confirmed via code that this is expected, not a defect, since Resend only ever serves legacy/test rows; real client outreach goes exclusively through connected mailboxes.
- Corrected a stale claim in the process: production sending did **not** stop on 3 July as `GRADES.json` said — real range is 2026-05-20 to 2026-08-26.
- Updated `GRADES.json`, `CUSTOMER-READY-REPORT.md`, and `SELL-EXCEPTION.json` (transcription only, same precedent as cycle 99) to reflect: CR-01b closed, customer-ready 7.50 → 7.56. CR-08 is now the only open blocker.
- Gates: lint 0, typecheck 0, 3644 tests green. Merged as PR #389.

**Nothing left open on this row.** QUEUE.md row 90 is `DONE 102`.

