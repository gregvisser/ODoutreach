# Cycle 127 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: src/server/mailbox/process-synced-replies.ts, src/server/mailbox/process-synced-replies.test.ts.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 04:38:33, took about 21.5 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/server/mailbox/process-synced-replies.ts, docs/ops/REPLY-MATCHER-PLUS-ALIAS-FIX-2026-08-30.md, src/server/mailbox/process-synced-replies.test.ts, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 127 - queue item 102

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **MEASURE WHETHER THE REPLY MATCHER IS STILL MIS-FILING FOR STAMPED SENDS - 1,095 PRODUCTION ROWS SIT ON THE ONE LEG ROW 100 DID NOT FIX.** Raised from cycle 124's own production evidence, not invented, and it is the honest unfinished half of the defect row 100 closed. Cycle 124 proved mechanism (ii) did NOT fire in the 29 August incident - but only because the sending mailbox `greg@bidlow.co.uk` is Microsoft Graph and this codebase does not stamp Graph sends, so 0 of that mailbox's 6 sends carry an `rfc822MessageId`. The same queries counted **1,095 rows in the same production table that DO carry one**. For every one of those, leg 3 of `processSyncedMessageForReply` in `src/server/mailbox/process-synced-replies.ts` is closed by its own `rfc822MessageId: null` filter, so a reply can link only through leg 1 (In-Reply-To equals the stamped id) or leg 2 (exact subject equality after prefix stripping). The file's own header comment states leg 1 misses for Gmail because Gmail rewrites the outgoing Message-ID at send time - which is exactly why leg 2 was added in the first place. That leaves EXACT SUBJECT EQUALITY as the only working leg for the majority of sends in the table, and cycle 124 recorded mechanism (ii) as a live latent hazard rather than a closed one. Its artefact: `docs/ops/REPLY-MATCHER-PLUS-ALIAS-FIX-2026-08-30.md`. **MEASURE FIRST AND DO NOT CHANGE THE MATCHER UNTIL YOU HAVE.** Read-only against production, by the same route cycle 124 used and documented, report three numbers: (a) `InboundReply` rows grouped by `matchMethod`, including how many exist with no linked outbound at all; (b) `OutboundEmail` rows with a stamped `rfc822MessageId` versus null; (c) THE NUMBER NOBODY HAS EVER MEASURED - how many `InboundReply` rows link to an outbound that was NOT the newest send to that recipient from that mailbox at the moment the reply arrived. That third number is the actual mis-filing rate. **THREE OUTCOMES AND ALL THREE ARE USEFUL:** near zero, so record mechanism (ii) as measured-and-not-biting, quote the query that proved it, and close this row; a real count, which is a defect with a known size and earns its own fix in this same cycle if it is small or its own row if it is not; or the measurement cannot be made read-only, in which case say exactly where it stopped and stop, rather than substituting an estimate. Do not report a number you did not run a query for. **A CONCRETE TESTABLE GAP FOUND WHILE READING THE CODE, worth doing either way and cheap:** the exported pure function `stripReplyPrefixes` handles re, sv, aw, antw, wg, tr, fwd, fw and one CJK form. It does NOT handle several prefixes real mail clients produce, among them RES, ODP, VS and a bare R followed by a colon. A reply carrying one of those fails leg 2's subject equality outright - and for a STAMPED send there is then no leg left at all, which is mechanism (ii) arriving through a different door. Add those cases to `src/server/mailbox/process-synced-replies.test.ts`, watch them FAIL against the current pattern and quote the failure, then extend the pattern. Keep the function pure and do not let it strip a prefix that is part of a real subject line. **WHAT THIS ROW MAY NOT DO:** do NOT touch `.bidlow/GRADES.json`, do NOT re-score any dimension, do NOT write to the sell gate. Do NOT widen or drop any existing safety constraint on legs 1, 2 or 3 - same client, same mailbox identity, sentAt at or before received, status in SENT DELIVERED REPLIED - those are what stop a stranger's mail being attributed to a prospect. Do NOT change how sends are stamped: the Graph-stamping gap cycle 124 named is a genuinely separate concern and belongs in its own row if the measurement shows it matters. No send. No client data mutated - every production query here is a SELECT. No schema change and no migration. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** a dated artefact under `docs/ops/` carrying the three numbers with the exact SQL that produced each, a plain statement of whether mechanism (ii) is biting in production today, the prefix test's red output quoted verbatim if that half was done, and lint 0, typecheck 0, the full unit suite green, merged to `main`. A claim in a cycle log is not evidence; the artefact on disk is.

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
  `DONE 127`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 127 - ...** |` reads correctly.
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

* Finished it -> `DONE 127 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 127 - <what is done, what is left>`. PARTIAL
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

STATE.md updated and pushed to the open PR. Waiting for the previously scheduled wakeup to check CI and merge — no further action needed right now.

