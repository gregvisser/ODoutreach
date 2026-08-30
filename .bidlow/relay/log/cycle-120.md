# Cycle 120 - queue item 92

## What it was asked to do, and the correction that matters most this cycle

The cycle brief handed to this session was "written by the relay itself, off
the top of QUEUE.md" and reproduced row 92's original text plus its
29-August "the reply now exists, go observe" update - the same text prior
cycles (111-117) already worked from. **That brief was stale.** Reading the
row directly from the live, committed `.bidlow/relay/QUEUE.md` (not the
brief) shows a further addition appended after cycle 117 closed, which the
brief did not carry:

> **STOP TAKING THIS ROW. READ THIS BEFORE ANYTHING ELSE.** Cycles 111
> through 120 have each taken this row and each reached the same place - ten
> cycles of the night spent re-observing a fixed state, because the row
> keeps being handed back as PARTIAL and the picker takes PARTIAL straight
> back up. **WHAT IS ALREADY SETTLED, do not re-prove any of it:** the SEND
> leg is PROVEN [...]. The REPLY arrives but is MATCHED TO THE WRONG SEND -
> confirmed by cycle 111 in the database, by cycle 112 on the operator
> screens, and again after a forced on-demand sync. That is a genuine
> product defect with its own row; fixing it is NOT this row's job. **WHEN
> YOU TAKE THIS ROW, DO NOTHING EXCEPT CLOSE IT.** Write the status as
> BLOCKED, never PARTIAL - PARTIAL is what causes the loop. [...] Do not
> re-walk, do not import another contact, do not build another sequence, and
> do not send a second email.

Per this session's own standing instruction ("if it is wrong, say so ... and
correct QUEUE.md" - this applies equally to a brief that is merely
out-of-date, not just wrong) this cycle follows the live row text, not the
stale brief, and records the discrepancy here rather than silently
re-running the walk the brief implied.

## First: the PR sweep

One open PR at cycle start: **#410** (`docs/state-cycle-119`, row 97's
"Chrome extension not available" record). `gh pr checks 410` showed both
`verify` and `E2E (Playwright)` pending; watched with `gh pr checks 410
--watch` until both went green (E2E 4m35s, verify 5m26s). Merged with
`gh pr merge 410 --squash --delete-branch`.

The local working tree also carried uncommitted leftovers from an
interrupted earlier attempt at this same cycle number: `QUEUE.md` (row 92's
status flipped to `IN PROGRESS 120`, nothing else) and `cycle-119.md` (an
extra, mid-sentence "Waiting on the background CI poll for PR #410" note
appended to an older, pre-merge copy of that file). Stashed both rather than
discarding unread, merged #410, then found the merge already brought in the
complete, correct `cycle-119.md` - making the stashed copy strictly
redundant - and that the `IN PROGRESS 120` marker was a note-to-self, not a
finished decision. Dropped the stash. No PRs open after the merge.

## Before doing anything to row 92 itself, this cycle also checked - independently of the "just close it" instruction - whether anything had actually changed since cycle 117

Not because the row asked for it (it now explicitly says not to), but because
before accepting "nothing changed" as the reason to stop, that claim was
worth a cheap, read-only check rather than an assumption:

```
date -u                              -> 2026-08-30, ~00:30-00:4x UTC (Sunday)
GET /api/health (direct App Service) -> {"ok":true,"checks":{"database":"ok"},
                                          "autonomousRelay":{"active":true,
                                          "allowlistedClients":1}}
gh run list --workflow=sync-replies.yml --limit 8
  -> most recent run 33282356034, workflow_dispatch, 2026-08-30T00:02:14Z -
     this is cycle 117's OWN trigger. Nothing has run since it (the cron,
     */15 7-18 * * 1-5, does not fire on Sundays at all).
Row 95 (the row that would change redispatch cadence) -> still "TODO",
  unchanged.
```

Confirms what the newly-found row text already asserts: nothing has moved
since cycle 117 closed roughly half an hour ago, and nothing could have. No
browser walk, screen check, contact import or send was performed this cycle.

## Closing this row

Per the row's own current, explicit instruction: dimension 1 stays at 8.
`.bidlow/GRADES.json` not touched. The send leg is proven
(`docs/ops/SEND-PROOF-2026-08-29.md`); the reply arrives but is matched to
the wrong thread because Gmail strips the `+cycle109` alias on Reply and the
matcher resolves contacts by exact address
(`docs/ops/REPLY-PROOF-2026-08-30-cycle117.md` and its predecessors). Fixing
that matcher is a real product decision (it touches contact de-duplication
and suppression matching, not just this observation) and is not this row's
job.

**One honest gap, flagged rather than acted on:** the row's text refers to
this defect as "a genuine product defect with its own row," but a search of
the current `.bidlow/relay/QUEUE.md` (all 83 rows, numbers 1-99) found no
row describing the alias-stripping reply-matcher gap under any phrasing
checked ("wrong thread", "reply matcher", "matcher gap", "contact
de-dup(e)", "+cycle109", "alias"). Either that row exists somewhere this
search missed, or it does not yet exist and needs creating. Per this
session's standing rule, a change to the method or a new row is not this
row's decision to make unilaterally while closing an unrelated item - noting
it here for Greg or the next cycle to queue deliberately, not creating it
myself.

## Re-score dimension 1

**Held at 8, unchanged.**

## What this does not cover

Unchanged from cycle 117: the send -> arrival -> reply -> correct-thread-match
chain remains unproven for a correctly-addressed send, and closes only when
either a fresh non-aliased send-and-reply is performed, or the matcher gap is
fixed as its own deliberate product change.

## A gate caught a real mistake in the first version of this closure

The first PR for this cycle (#411) failed CI's `verify` job on a real,
load-bearing test: `relay/queue-file-integrity.test.ts` - "keeps BLOCKED and
WONTFIX rows below every row still to be done." `Invoke-SelfQueue` (the
watcher's picker) takes the first row in FILE ORDER that is not DONE/IN
PROGRESS, and if that row is BLOCKED it halts rather than skipping past it -
"the order is the plan." Row 92 sat at line 319, above four TODO rows (97,
93, 94, 95 at lines 321-324); marking it BLOCKED in place, without moving it,
would have silently frozen the entire queue behind it the next time the
picker reached it. This is exactly the row-48/cycle-70 incident the test's
own comment describes, and the gate did its job - it was run and it failed,
and the failure was read rather than forced past. Fixed by moving row 92's
table row (content unchanged) to sit directly before row 84, the first of
the two existing BLOCKED rows already correctly parked at the bottom of the
table - so the BLOCKED/WONTFIX group (92, 84, 48) now sits entirely below
every remaining TODO row, preserving the file's one contiguous table.
Re-ran `relay/queue-file-integrity.test.ts` locally: 9/9 pass, including the
BOM/encoding guards (the reorder was done with a small Node script operating
on the raw buffer specifically to avoid disturbing the BOM or line endings
those tests guard).

## Files changed this cycle

- `.bidlow/relay/QUEUE.md` - row 92 status (`BLOCKED`, not `PARTIAL`, per
  the row's own instruction) and its position in the table (moved below all
  TODO rows, per `relay/queue-file-integrity.test.ts`).
- `.bidlow/relay/log/cycle-120.md` - this file.

No code changed. No other queue row touched. No email sent. No migration. No
contact imported, no sequence built. `ODOUTREACH-PROJECT-INSTRUCTIONS.md`
left uncommitted and untouched (unrelated to any queue row).


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 120 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 01:28:18, took about 39.6 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, src/server/safety/autonomous-mode.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 120 - queue item 92

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **DIMENSION 1 IS HELD AT 8 BECAUSE NOBODY HAS CLICKED SEND-AND-REPLY THROUGH THE SCREENS ON THIS BUILD. THAT IS A TEST NOBODY HAS RUN, NOT A SCORE THAT IS WRONG.** `.bidlow/GRADES.json` dimension 1 (Core journeys end-to-end, weight 18, score 8) says it in as many words: the browser walk is navigation-only. The score moves if, and ONLY if, the journey is actually performed and recorded. It does NOT move because the code looks like it ought to pass, because an integration test covers the same chain, or because this walk was longer than the last one. **WALK IT AS A HUMAN:** signed in as staff, go through the screens an operator actually uses - pick or enrol a contact, prepare the send, send it, watch it arrive, reply from the recipient side, and confirm the reply lands back in the product against the right thread and the right contact. **THE HARD RULE APPLIES AND IS NOT NEGOTIABLE: real mail may leave for `bidlowai` and for nobody else.** The guard is `src/server/safety/autonomous-mode.ts`; production /api/health currently reports allowlistedClients 1. If this walk appears to need a send for any other client, THE WALK IS WRONG - stop and write down why. **RECORD IT LIKE THE LAST ONE:** a dated artefact under `docs/ops/`, in the shape of `SEND-PROOF-2026-08-26.md` and `REPLY-PROOF-2026-08-26.md` - what was clicked, in what order, against which commit, what actually left, the raw evidence, and UTC timestamps. A cycle log claiming it happened is not the artefact; this project's signature defect is precisely the thing that reports success and never fired. **THEN, AND ONLY THEN, re-score dimension 1**, and name plainly what the walk did NOT cover. **DO NOT TOUCH ANY OTHER DIMENSION.** If the walk cannot be completed, LEAVE THE SCORE AT 8, say which step blocked it, and mark this row PARTIAL (note: PARTIAL rows are only picked up once the watcher has been restarted - see row 95). **DO NOT WORK BACKWARDS FROM 8.0.** Greg's instruction, verbatim: a re-walk that goes looking for +0.38 will find +0.38. Let the number land where it lands. **APPROVAL ALREADY GIVEN - RECORDED HERE ON 29 AUGUST SO NO FURTHER CYCLE STOPS TO SEEK IT.** In Cowork on 29 August the owner was asked, in these words, whether row 92's real-send instruction should be allowed to run or be stopped. He answered: Let it run. That approval covers the SEND leg of this walk, for `bidlowai` and for no other client, and it stands. Do not stop again to seek it and do not re-raise it. Cycle 109 was right to hesitate, but only because this row did not yet carry the approval. **WHAT THIS CLEARS AND WHAT IT DOES NOT:** the send may now be performed and proven. The REPLY leg cannot be performed here at all - a genuine external reply has to be typed by a person at the receiving inbox (greg.visser64@gmail.com), and this workspace holds no second mailbox able to author one. So once the send and its arrival are proven and recorded in a dated artefact under `docs/ops/`, mark this row PARTIAL naming the reply-and-match leg as the remainder, and STOP. **DO NOT RE-WALK IT AGAIN:** cycle 110 established that re-running an identical build against unchanged code produces no new information and litters the workspace with throwaway contacts. Dimension 1 stays at 8 until the reply is matched - reaching Ready to launch, or sending alone, does not move it. **UPDATE 29 AUGUST 22:51 UTC - THE REPLY NOW EXISTS, SO THE LAST LINK IS AVAILABLE TO PROVE.** The owner confirms he received the outreach email in greg.visser64@gmail.com and has REPLIED to it. The human half of the reply leg is therefore done and no longer blocks this row. What remains is pure observation: prove the reply came back INTO the product, was matched to the right thread and the right contact, and is visible on the screens an operator actually uses. Do it read-only wherever possible, record it in a dated artefact under `docs/ops/` alongside the send evidence, and only then re-score dimension 1. **HIS WORD IS NOT THE ARTEFACT.** It confirms the reply was SENT; the product ingesting it and matching it correctly is the thing this row has to observe for itself. If the reply has not been ingested yet, say how long it has been waiting and what the inbound path is blocked on, leave the score at 8, and mark this PARTIAL naming exactly that - do not mark it proven on the strength of the owner saying he replied.

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
  `DONE 120`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 120 - ...** |` reads correctly.
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

* Finished it -> `DONE 120 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 120 - <what is done, what is left>`. PARTIAL
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

`.bidlow/STATE.md` is updated and merged (`062e21e`). Summary of this final step: recorded cycle 120's full session (row 92 closed BLOCKED, the stale-brief discrepancy, the CI-caught picker-halt bug and its fix), and flagged an uncommitted, externally-authored edit to row 97 that appeared on disk near the end of the session — left untouched since it wasn't this cycle's row, and noted for the next session to read fresh. `main` is current at `062e21e`, no open PRs.

