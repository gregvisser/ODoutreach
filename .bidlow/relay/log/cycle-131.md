# Cycle 131 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 6A61D6BA12FC
  On disk now:      B9E192203DEB

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-30 06:19:03, took about 27.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md, src/server/email/outbound/send-introduction.ts, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 131 - queue item 106

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **WHEN A LAUNCH IS REFUSED THE OPERATOR IS TOLD NOTHING USEFUL, AND THIS PRODUCT ALREADY KNOWS THE REAL REASON AT THAT EXACT MOMENT AND THROWS IT AWAY.** The refusal an operator sees is `Composition lost send-readiness between planning and dispatch; re-plan` - it names no cause, offers no next step, and is identical whatever went wrong. **THE COST IS MEASURED, NOT HYPOTHETICAL:** cycles 105 and 106 both walked the real screens, both hit this exact wall, and it took a THIRD cycle (107) reading deployed source to find the actual cause - a null `Client.defaultSenderEmail`. Two full cycles burned on a message that could have said it. A real client hitting the same wall has no third cycle; they have a support call, or they give up. Evidence: `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md`. **THE FIX IS ALREADY SITTING THERE UNUSED, and cycle 108 said so explicitly when it deliberately left this out of scope:** `composeSequenceEmail` already computes `missingFields` and `warnings` describing precisely what is absent, and they are available at `src/server/email/outbound/send-introduction.ts` around lines 1093-1115, where the generic message is produced instead. This is not new logic to invent - it is a value the code already holds and discards. **MEASURE FIRST:** read that block and say exactly what `missingFields` and `warnings` contain in the refusal case, then find EVERY place that generic string is produced or surfaced (grep the whole of `src` for it) and name each one, because a message fixed in one place and left in another is worse than not fixing it - the operator then gets different explanations for the same failure. **RED-FIRST:** a test asserting that a composition refused for a missing unsubscribe rail surfaces a message NAMING that missing field, watched failing against the current generic string and quoted verbatim before any change. **WRITE IT FOR AN OPERATOR, NOT A DEVELOPER.** `unsubscribe_link` is a field name, not an explanation. The message must say what is missing in plain words and what would fix it - and where a product screen exists to fix it, say which one, because row 99 added exactly such a control for the default sender email on the client Mailboxes tab. Do NOT leak internal field names, table names, ids or stack detail onto an operator screen: dimension 3 was scored 9 on the strength of that discipline and this row must not undo it. **DO NOT WEAKEN THE GUARD ITSELF.** The refusal must still refuse. This row changes what the operator is TOLD, never whether the send is allowed - a send that is not ready must remain blocked, and any change that lets one through is a defect far worse than the message it fixes. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. If this improves error handling that is for a future measured walk to observe, not for this row to assert. **SCOPE:** `src/server/email/outbound/send-introduction.ts`, whatever screen renders the refusal, their tests, and a dated artefact under `docs/ops/`. No schema. No migration. No send - `bidlowai` has a sequence sitting at Ready to launch for the owner's own click and THIS ROW MUST NOT LAUNCH IT or create another. No client data mutated. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** every place the generic string is produced named in a dated artefact under `docs/ops/`, the red-first failure quoted verbatim, the new operator-facing wording quoted in full so a human can judge whether it reads like English, proof the guard still refuses, lint 0, typecheck 0, the full unit suite green, merged to `main`.

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
  `DONE 131`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 131 - ...** |` reads correctly.
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

* Finished it -> `DONE 131 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 131 - <what is done, what is left>`. PARTIAL
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

Clean — no open PRs. Cycle 131 / row 106 is done.

**Summary:** The "Composition lost send-readiness between planning and dispatch; re-plan" refusal was replaced with a specific, plain-English message that names what's actually missing (e.g. "No unsubscribe link could be created for this send — set the client's default sending email on the Mailboxes tab") — never leaking raw field names, and never weakening the guard itself (a not-ready send still blocks). Red-first proof, every surfaced call site, and the new wording are documented in `docs/ops/LAUNCH-REFUSAL-MESSAGE-2026-08-30.md`. Merged via PR #427 (`2573c53`); QUEUE.md updated via PR #428 (`3dd9351`). Gates: lint 0, typecheck 0, 349 files/3667 tests green.

Two things worth flagging directly:
- The brief's file path was wrong (`src/server/email/outbound/send-introduction.ts` doesn't exist — the real file is `src/server/email-sequences/send-introduction.ts`, same line numbers). Corrected in the artefact rather than worked around.
- Found a live, related leak **out of this row's scope**: `sequence-send-policy.ts`'s plan-time catch-all still puts raw `{{sender_company_name}}`-style tokens in front of operators for fields other than email/unsubscribe. Recommend it as its own queue row.

`ODOUTREACH-PROJECT-INSTRUCTIONS.md` remains untracked in the repo root — it predates this cycle and no queue row references it, so I left it alone rather than guessing whether to commit or discard it.

