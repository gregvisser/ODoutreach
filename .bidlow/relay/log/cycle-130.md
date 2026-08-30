# Cycle 130 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: src/server/mailbox/process-synced-replies.ts.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 6A61D6BA12FC
  On disk now:      B9E192203DEB

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-30 05:51:07, took about 26.9 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/server/mailbox/process-synced-replies.ts, src/server/mailbox/process-synced-replies.test.ts, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 130 - queue item 105

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE MOST RELIABLE LEG OF THE REPLY MATCHER HAS NEVER FIRED ONCE IN PRODUCTION, AND THE WHOLE PRODUCT IS RUNNING ON THE WEAKER TWO.** Measured, not suspected. Cycle 127 counted every `InboundReply` row in production: **39 replies, ALL of them `BY_CONTACT_EMAIL`, and ZERO `BY_THREAD_REF` ever recorded.** Leg 1 of `processSyncedMessageForReply` in `src/server/mailbox/process-synced-replies.ts` is the one the file's own comment calls definitive and unambiguous - the reply's In-Reply-To header equalling the Message-ID stamped on a specific send. It has never matched anything, ever. Meanwhile 1,095 of 1,419 outbound rows DO carry a stamped `rfc822MessageId`, so it is not that there was nothing to match against. Every reply this product has ever linked was linked by the heuristic legs - recipient address plus subject equality - which is exactly what broke on 29 August and needed row 100 to repair. **TWO NAMED SUSPECTS, BOTH FROM THIS WEEK'S OWN EVIDENCE, AND THE ROW IS TO CONFIRM OR CLEAR EACH RATHER THAN ASSUME EITHER:** (i) for Gmail sends, the file's own header comment states Gmail REWRITES the outgoing Message-ID at send time, so the value stored at send never equals the value the recipient's client actually replies to - the stamp is real but permanently wrong; (ii) for Microsoft Graph sends, cycle 124 established this codebase does not stamp them at all (0 of that mailbox's 6 sends carried one). If both hold, leg 1 is dead BY CONSTRUCTION for every send the product makes, and the definitive path is decorative. **MEASURE FIRST, READ-ONLY, AND QUOTE THE QUERIES.** Against production: how many stamped sends exist per provider; whether any `InboundReply.inReplyToProviderId` value has ever equalled any `OutboundEmail.rfc822MessageId` (an anti-join proving the miss, not just the absence of matches); and what the send path actually stores - read `sendViaConnectedMailboxOrFail` and the Gmail and Graph provider code under `src/server/email/providers` and name the exact field written and where its value comes from. **THEN SAY WHICH OF THREE ANSWERS IS TRUE, and all three are worth having:** leg 1 is fixable by storing the provider's OWN returned message id at send time instead of one we generated (both Gmail and Graph return it on the send response); or leg 1 is not fixable for a provider and should be documented as such so nobody trusts it again; or leg 1 is already correct and something else explains the zero, in which case say what. **IF AND ONLY IF THE MEASUREMENT SHOWS A FIXABLE CAUSE, fix it RED-FIRST:** a test in `src/server/mailbox/process-synced-replies.test.ts` asserting a reply whose In-Reply-To equals the provider's returned id links by `BY_THREAD_REF`, watched failing before the change and quoted. A schema change may genuinely be needed here - if so, STOP and write down exactly what and why rather than running a migration, because `PRODUCTION_PRISMA_MIGRATE` is true and merging a migration applies it to the live client database. **DO NOT COMPENSATE BY LOOSENING THE HEURISTIC LEGS.** Legs 2 and 3 keep every constraint they have - same client, same mailbox identity, sentAt at or before received, status in SENT DELIVERED REPLIED, subject equality on leg 2. Widening them to paper over leg 1 would trade a precise fix for a new class of mis-attribution, which is the opposite of the point. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. If this turns out to be a real defect it earns a blocker entry, not a score change, and the entry is a statement of fact rather than an argument for a number. **SCOPE:** the matcher, the send path's message-id handling, their tests, and a dated artefact under `docs/ops/`. No send. No client data mutated - every production query is a SELECT. No migration without stopping first. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** a dated artefact under `docs/ops/` carrying the queries and their results, a plain statement of which of the three answers is true and why, the red-first failure quoted if a fix was made, and lint 0, typecheck 0, the full unit suite green, merged to `main`. If the honest outcome is 'measured, not fixable here, documented so nobody trusts leg 1 again', that is a complete and valuable answer - close the row on it rather than inventing a fix.

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
  `DONE 130`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 130 - ...** |` reads correctly.
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

* Finished it -> `DONE 130 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 130 - <what is done, what is left>`. PARTIAL
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

`.bidlow/STATE.md` is updated and merged (`d76af54`, PR #426). Session state now records the row 105 findings, the three doc-only fixes, and the next-session pickup list — the follow-up send-path fix is scoped but explicitly not started.

