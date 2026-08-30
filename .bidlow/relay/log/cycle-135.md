# Cycle 135 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (1 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Watcher script: B9E192203DEB - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 07:58:17, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 135 - queue item 108

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **MAKE THE DEFINITIVE REPLY MATCH ACTUALLY WORK FOR GMAIL. GREG HAS DECIDED THIS IS WORTH DOING - BUILD IT, DO NOT JUST PLAN IT.** Cycle 130 established the fact (`docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md`): leg 1 of `processSyncedMessageForReply` has NEVER matched a reply. Gmail stamps 100% of sends but REWRITES the Message-ID at delivery - 9 of 9 sampled replies carry Gmail's own `mail.gmail.com` id, never the one we generated and stored. Anti-join: 0 of 36 header-bearing replies have ever matched a stored `rfc822MessageId`. So 100% of reply matching in this product has been done by the two heuristic legs, and subject-equality is the load-bearing one - which breaks the first time a client reuses a subject line across two campaigns to the same prospect. That is normal outreach, not an edge case. **WHY THIS IS THE SAFE HALF, and why it is being done before the Microsoft half:** the Gmail fix is ADDITIVE AND POST-SEND BY CONSTRUCTION. The email has already left before this code runs. It cannot block a send, cannot duplicate a send, and cannot change what the recipient receives - it only corrects a value we store afterwards. The Microsoft half changes HOW the send happens and is deliberately a separate row. **STEP 1 - PROVE IT ON REAL DATA BEFORE WRITING THE FIX, read-only.** Take an EXISTING already-sent Gmail `OutboundEmail` row. Fetch that message from the Gmail API read-only (`messages.get`, `format=metadata`, `metadataHeaders=Message-ID`). Show three things: the delivered `Message-ID` differs from our stored `rfc822MessageId`; the delivered value is EXACTLY what the corresponding reply's `In-Reply-To` contains; and the id is available from the send response's own message id without any extra bookkeeping. Quote the real values. If any of those three is false, STOP and say so - the fix is wrong and must not be built. **STEP 2 - RED FIRST.** A test asserting that after a Gmail send the stored `rfc822MessageId` equals the PROVIDER'S delivered Message-ID rather than the one we generated. Watch it fail against the current code and quote the failure. Then a second test asserting a reply carrying that delivered id links by `BY_THREAD_REF` - the leg that has never fired. **STEP 3 - BUILD IT, in the Gmail send path only.** After `messages.send` returns successfully, read back the delivered `Message-ID` for the returned message id and update that `OutboundEmail` row's `rfc822MessageId`. **THE SAFETY CONTRACT, AND IT IS ABSOLUTE: IF THE READ-BACK FAILS, THE SEND STILL STANDS.** Wrap it so that no exception, timeout, rate-limit or malformed response can propagate. On any failure: log it, leave the originally stored value in place, and carry on - that send simply keeps today's heuristic matching. It must never throw into the send path, never mark a successful send as failed, never retry in any way that could cause a second email, and never run before the send has succeeded. A delivered email is worth more than a matching id, and a fix that could block a send would be far worse than the problem it solves. **EXPLICITLY OUT OF SCOPE - do NOT do these here:** do not backfill the 1,095 existing stamped rows (a bulk write to real client data, and its own decision); do not touch the Microsoft Graph send path (row 110); do not change legs 2 or 3 of the matcher, which stay exactly as they are as the fallback for every historical row; do not weaken any existing safety constraint. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. **SCOPE:** the Gmail send path and its provider module, the matcher test file, and a dated artefact under `docs/ops/`. A schema change should NOT be needed - `rfc822MessageId` already exists. If you believe one is needed, STOP and write down what and why: `PRODUCTION_PRISMA_MIGRATE` is true and merging a migration applies it to the live client database. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the step-1 comparison quoted with real values; both red-first failures quoted verbatim then green; the failure-path behaviour demonstrated by a test that makes the read-back throw and asserts the send is still recorded as sent; lint 0, typecheck 0, the full unit suite green, merged to `main`, and deployed with the commit confirmed on the DIRECT App Service origin using a cache-buster.

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
  `DONE 135`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 135 - ...** |` reads correctly.
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

* Finished it -> `DONE 135 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 135 - <what is done, what is left>`. PARTIAL
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


