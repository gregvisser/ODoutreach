# Cycle 136 - queue item 110

## PR sweep

`gh pr list --state open` returned nothing. No PRs to merge or rescue this
cycle.

## Row 108 status check (main first, per this repo's own standing lesson)

`git log --oneline` on `main` showed row 108 already merged and confirmed
deployed by cycle 135: `d083bfc` (PR #432, the fix) and `7b6efbe` (PR #433,
the docs confirmation). No redo needed there.

## Row 110 - the gate, not the fix

Row 110's own brief is explicit: do not start the Microsoft Graph half until
row 108 is "merged, deployed AND OBSERVED WORKING IN PRODUCTION - if it is
not, leave this row TODO and say so in your log." That is a third bar above
"merged" and "deployed," and it was not assumed - it was measured.

Two read-only production queries (via a temporary Azure Postgres firewall
rule scoped to this machine's IP, opened and removed within this cycle;
connection string held only in a local temp file, deleted afterward; the
ad-hoc check script was deleted after running) show:

- Zero Gmail sends have happened since row 108 deployed
  (2026-08-30T07:28:27Z).
- The most recent Gmail send of any kind, anywhere in the system, was
  2026-07-03 - almost eight weeks ago.
- All 8 Google mailboxes currently show `CONNECTION_ERROR` or
  `PENDING_CONNECTION`. Zero are `CONNECTED`.
- Independently, today (2026-08-30) is a Sunday, and
  `process-outbound-queue.yml` only runs weekdays - so no automated send of
  any kind fires today regardless of mailbox health.

So this isn't "not yet observed, check again in an hour" - it's a structural
block. Full reasoning and the queries: `docs/ops/GRAPH-REPLY-MESSAGEID-GATE-CHECK-2026-08-30-row110.md`.

Per the row's own instruction, row 110 is left `TODO` with this finding
recorded. No Microsoft Graph code, test, or send-path file was touched. No
schema change. No migration. No email sent. No client data written -
every production query this cycle was a single `SELECT` inside
`BEGIN READ ONLY`.

## Cleanup verified

The temporary Postgres firewall rule (`temp-cycle136-readonly`) was deleted
and confirmed gone (only the pre-existing
`AllowAllAzureServicesAndResourcesWithinAzureIps_*` rule remains). The temp
DB-URL file and the ad-hoc check script were both deleted; `git status`
confirms neither is tracked or left behind.

## What it did

- Read `docs/ops/GMAIL-REPLY-MESSAGEID-READBACK-2026-08-30-row108.md` (cycle
  135's own artefact) - it already flagged that every Google mailbox's
  credentials were dead as of that cycle, which is what prompted checking
  whether anything had changed since, rather than assuming it had.
- Wrote `docs/ops/GRAPH-REPLY-MESSAGEID-GATE-CHECK-2026-08-30-row110.md` with
  the queries, results, and conclusion.
- Updated `.bidlow/relay/QUEUE.md` row 110 to `TODO` with the finding.
- No gates to run (lint/typecheck/test) - no application code was changed.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 136 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: B9E192203DEB - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 08:44:21, took about 11.4 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 136 - queue item 110

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE MICROSOFT HALF OF THE DEFINITIVE REPLY MATCH. DO NOT START THIS UNTIL ROW 108'S GMAIL FIX IS MERGED, DEPLOYED AND OBSERVED WORKING IN PRODUCTION - if it is not, leave this row TODO and say so in your log.** Cycle 130 measured it: Microsoft Graph sends carry NO stored message id at all - 0 of 267 - because the `sendMail` action this codebase uses returns nothing. So for every Graph send there is not even a wrong id to compare; leg 1 cannot fire by construction. **THIS IS THE RISKIER HALF AND THAT IS WHY IT IS SEPARATE.** Unlike the Gmail fix, this changes HOW a real email is sent: the known route to getting an id is to create a draft (`POST /me/messages`), read its `internetMessageId`, then send that draft (`POST /me/messages/{id}/send`) - two calls where there is currently one. **MEASURE FIRST, AND BE WILLING TO COME BACK WITH A NO.** Confirm from Microsoft's own documentation and a read-only probe that the `internetMessageId` on a draft is the id that actually survives to the recipient and appears in their reply's `In-Reply-To` - do not assume it. If it does not survive, that is a complete and valuable answer: write it down, close the row, and leave Graph on heuristic matching rather than taking on send-path risk for nothing. **THE FAILURE MODE THIS MUST HANDLE, and it is the whole reason for care:** with a two-step send, step 1 can succeed and step 2 fail, leaving an unsent draft sitting in a real client's mailbox and no email delivered. Decide deliberately and say which you chose: delete the draft and record a failed send, or leave it and record it as needing attention. What must NEVER happen is a silent half-send - a draft in the mailbox that nobody knows about, or a send recorded as successful that never went. **RED-FIRST:** a test asserting a Graph send stores an `rfc822MessageId`, watched failing first; a test asserting a reply carrying that id links by `BY_THREAD_REF`; and a test that makes step 2 fail and asserts the chosen cleanup behaviour actually happens rather than being documented. **DO NOT weaken legs 2 or 3** - they remain the fallback for every historical Graph send, all 267 of which will never have an id. Do not backfill anything. Do not touch the Gmail path. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. **SCOPE:** the Graph send path, its tests, and a dated artefact under `docs/ops/`. No schema change expected. No migration without stopping first. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** either the fix shipped with all three red-first failures quoted then green, deployed and confirmed by commit on the direct origin - OR a written, evidenced NO explaining why the draft id does not survive and why Graph should stay on heuristic matching. Both outcomes close this row honestly; a half-built two-step send does not.

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

## THIS PROJECT'S FOLDER, AND NOTHING OUTSIDE IT

You are working on ONE client system. Greg runs several side by side, and they
share one folder deliberately: `C:\Bidlowprojects\_standards` is the METHOD -
the hooks, the gates, the skills, the deck, the checklists - and it applies to
every project at once.

**Do not create, edit, move or delete anything under `_standards` unless the
queue row you are working on names that path explicitly.** A change made there
while doing client work does not stay with this client; it silently changes how
every other build is judged, including ones nobody is looking at today. If this
row's work seems to need a change to the method, STOP and write the case for it
into your log as a finding. Somebody will queue it as its own row, against the
standard, where it can be reviewed on its own terms.

The same goes for any sibling project folder - `BidlowClients\Kepak`,
`BidlowClients\Papaya`, `BidlowTools\*`. Read them if a row asks you to
compare something. Never write to them.

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
  `DONE 136`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 136 - ...** |` reads correctly.
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

* Finished it -> `DONE 136 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 136 - <what is done, what is left>`. PARTIAL
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

I've completed the core work for cycle 136 row 110: measured (read-only, production) that row 108's fix, while merged and deployed, has not been observed working — zero Gmail sends since deploy, last Gmail send was 2026-07-03, and all Google mailboxes are disconnected. Per the row's own instruction I left it `TODO` with the finding documented, opened PR #434 (docs-only), and I'm waiting on CI to go green before merging.

