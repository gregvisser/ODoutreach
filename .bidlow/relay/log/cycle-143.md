# Cycle 143 - queue item 110

## Before anything else: the four things written down

1. **Files I might change:** `.bidlow/relay/QUEUE.md` (row 110's status cell,
   plus restoring row 113's position - see "queue-order defect" below),
   `.bidlow/relay/log/cycle-143.md` (this file). No application code file is
   named, because whether any Graph code gets touched at all depends
   entirely on the gate check below, same as cycles 136 and 137.
2. **The red-first test:** none. Row 110 forbids starting the Microsoft
   Graph work - draft-then-send, the `rfc822MessageId` capture, the
   `BY_THREAD_REF` test, the step-2-failure cleanup test - until row 108's
   Gmail fix is observed working in production. The gate is still not met
   (below), so there is nothing to write a red test against.
3. **What "done" looks like today:** either the gate is met and the Graph
   work starts for real, or it is still not met and row 110 stays `TODO`
   with a fresh, dated confirmation - a non-coder can check this by reading
   whether any Google mailbox shows `CONNECTED` in the probe output below.
4. **What I must not touch:** the Microsoft Graph send path,
   `execute-one.ts`'s Gmail branch, `process-synced-replies.ts` legs 2/3, the
   content of rows 111-116 (only their status cells / row 113's position, per
   this row's own instruction), and `.bidlow/GRADES.json`.

## PR sweep

`gh pr list --state open` returned `[]` - zero open PRs. Nothing to merge or
comment on.

## Leftover state from cycle 142 (killed at the 45-minute deadline)

Before touching row 110, I checked what was sitting in the working tree,
because `git status` showed a modified `QUEUE.md`, an untracked
`cycle-142.md`, and an untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md`, and
the local branch (`docs/row-116-prod-logging-cycle-142`) was not an ancestor
of `origin/main`.

Investigated per this project's own "a row reopened after a relay timeout
may already be merged" rule (`CLAUDE.md`): cycle 142's row-116 work
(`dbaca08`) has an **identical tree** to `origin/main`'s `f92f97e` (`git diff
dbaca08 f92f97e --stat` = empty) - it was fully merged as PR #442 before the
kill fired. Row 116's `DONE 142` status was already committed as part of
that same commit, so nothing there needed redoing.

What was NOT committed before the kill: `cycle-142.md` (the timed-out-cycle
log, 166 lines, describing what cycle 142 actually did) and the picker's own
edit setting row 110 to `IN PROGRESS 143`. Per this repo's established
pattern (cycle 136 committed cycle 135's orphaned timeout log the same way),
I carried `cycle-142.md` forward and I am committing it alongside this
cycle's own log, unedited.

`ODOUTREACH-PROJECT-INSTRUCTIONS.md` is unrelated to either row 116 or row
110 - it reads as draft copy for a Claude Project's Instructions field, not
application code or a relay artefact, and the repository boundary rule in
`CLAUDE.md` puts scope/handover artefacts in `C:\Bidlowbusiness`, not the
code repo. I left it untouched and uncommitted: not mine to place, not
mine to delete.

I switched to a fresh branch (`docs/row-110-gate-recheck-cycle-143`) off
`origin/main` before doing any of row 110's own work, so this cycle's PR is
a clean, current diff rather than one carrying cycle 142's stale base.

## The queue-file rule, checked first as instructed

Read `.bidlow/relay/QUEUE.md` on disk and confirmed all six supervisor rows
- 111, 112, 113, 114, 115, 116 - are present. None missing, so the "say so
loudly" alarm does not fire.

**Order defect found and fixed.** The row's own text says the order must
stay `115, then 111, 112, 113, 116, then this row's neighbours [108, 110],
with 114 near the end and the BLOCKED rows (92, 84, 48) at the very back`.
On disk the order was `115, 111, 112, 116, 108, 110, 114, 95, 117, 92, 84,
48, 113` - row 113 had drifted to the very end, sitting after the BLOCKED
rows rather than between 112 and 116. Likely cause: row 113 itself resolved
to `BLOCKED 141` (cycle 141, ANTHROPIC_API_KEY absent from prod) and
something moved it to sit with the other BLOCKED rows, which is thematically
understandable but contradicts the explicit, numbered order this row
demands. This is a low-risk, additive fix (move one existing row; no content
changed, no row renumbered, no row removed), and the brief was explicit that
the order matters more than my own row's work, so I restored it: row 113 now
sits immediately after 112 and before 116, its content and `BLOCKED 141`
status untouched. Diff confirmed scoped to exactly two rows (110, 113) via
`git diff .bidlow/relay/QUEUE.md | grep '^[+-]| [0-9]+ |'`.

Committed the file as found on disk otherwise - no other row's content
touched, nothing reconstructed from an earlier commit.

## Row 110 - the gate, re-checked fresh rather than trusting cycle 137

Row 108's Gmail fix is merged and deployed: `d083bfc`, confirmed live via
`GET /api/build-info` on the direct `app-opensdoors-outreach-prod
.azurewebsites.net` origin (checked as part of row 108's own cycle 135 log;
not re-checked here since the commit hasn't changed).

The gate is "merged, deployed, AND OBSERVED WORKING IN PRODUCTION." Cycles
136 and 137 both found this not met because every Google mailbox was
disconnected, so the fixed code path (which only runs after a successful
Gmail `messages.send`) could never fire. Rather than assume six hours-old
findings still hold, I re-ran the repo's own read-only tool fresh:

```
gh workflow run mailbox-credential-probe.yml
-> run 33307493700, triggered 2026-08-30T10:51:40Z, completed success (1m26s)
```

Verbatim summary from the run log:

```
Live mailboxes by status and stored credential:
   27  CONNECTED + credential
    3  CONNECTION_ERROR + NO credential
    4  CONNECTION_ERROR + credential
    2  DISCONNECTED + credential
   11  DRAFT + NO credential
    8  PENDING_CONNECTION + NO credential

27 of 55 live mailboxes can send right now (CONNECTED and holding a credential).
```

Cross-referenced the two `[GOOGLE]`-tagged mailboxes in the same run's
per-mailbox detail (`jo***@greentheuk.com`, `ad***@greentheuk.com`) - both
appear only in the stranded/pending section (`8 live mailbox(es) STRANDED by
an unfinished Connect`), neither in the `CONNECTED` group. **Zero Google
mailboxes are CONNECTED in production right now** - the same structural
block cycles 136 and 137 found, reconfirmed fresh rather than assumed.
`process-outbound-queue.yml` is also weekday-only and today is still Sunday
2026-08-30, so no automated send could have exercised the fixed path even if
a mailbox briefly held a working token between checks.

So: the gate is still not met, for the same reason. Per row 110's own
instruction, left it `TODO` with this fresh evidence quoted in the status
cell, and touched no Microsoft Graph code, no send path, no matcher legs.

## Gates run

None applicable - no application code changed this cycle (queue-file and log
edits only). `npm run lint` / `npm run typecheck` / `npm test` were not run
because nothing in `src/` changed; re-running them against an unchanged tree
would prove nothing new.

## What's left

Row 110 stays `TODO`, waiting on a real Gmail mailbox reconnect (row 84 -
BLOCKED, needs each client's owner to sign in, and separately the Google
OAuth app publish Greg has twice declined) before the gate can ever be met.
No cycle can close this by re-measuring more often; the next useful check is
after a Google mailbox actually reconnects and sends.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 143 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: B9E192203DEB - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 11:49:51, took about 9.9 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md, bidlow/GRADES.json

## What it was asked to do

# Cycle 143 - queue item 110

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **READ THIS FIRST - IT IS ABOUT THE QUEUE FILE, NOT ABOUT THIS ROW'S WORK, AND IT MATTERS MORE THAN THIS ROW'S WORK.** `.bidlow/relay/QUEUE.md` on disk contains six rows added by the supervisor this morning - **111, 112, 113, 114, 115 and 116**. They have now been SILENTLY DISCARDED TWICE by cycles that committed a version of the queue file predating them. Row 115 is the one that matters most: it carries Greg's explicit written authorisation for the relay to send one real email, and losing it costs the whole point of today. **SO, BEFORE ANYTHING ELSE:** read QUEUE.md and confirm rows 111 through 116 are present. When you commit your own status update to QUEUE.md at the end of this cycle, commit the file AS IT IS ON DISK so those rows go with it. Do NOT `git checkout` or reset QUEUE.md, do NOT reconstruct it from an earlier commit, and do NOT remove or renumber any row you did not create. If any of 111-116 is missing when you look, say so loudly in your log - that is a defect in how cycles handle this file and it needs its own row. **THE ORDER MUST STAY:** 115, then 111, 112, 113, 116, then this row's neighbours, with 114 near the end and the BLOCKED rows (92, 84, 48) at the very back. THE ORIGINAL BRIEF FOLLOWS. **THE MICROSOFT HALF OF THE DEFINITIVE REPLY MATCH. DO NOT START THIS UNTIL ROW 108'S GMAIL FIX IS MERGED, DEPLOYED AND OBSERVED WORKING IN PRODUCTION - if it is not, leave this row TODO and say so in your log.** Cycle 130 measured it: Microsoft Graph sends carry NO stored message id at all - 0 of 267 - because the `sendMail` action this codebase uses returns nothing. So for every Graph send there is not even a wrong id to compare; leg 1 cannot fire by construction. **THIS IS THE RISKIER HALF AND THAT IS WHY IT IS SEPARATE.** Unlike the Gmail fix, this changes HOW a real email is sent: the known route to getting an id is to create a draft (`POST /me/messages`), read its `internetMessageId`, then send that draft (`POST /me/messages/{id}/send`) - two calls where there is currently one. **MEASURE FIRST, AND BE WILLING TO COME BACK WITH A NO.** Confirm from Microsoft's own documentation and a read-only probe that the `internetMessageId` on a draft is the id that actually survives to the recipient and appears in their reply's `In-Reply-To` - do not assume it. If it does not survive, that is a complete and valuable answer: write it down, close the row, and leave Graph on heuristic matching rather than taking on send-path risk for nothing. **THE FAILURE MODE THIS MUST HANDLE, and it is the whole reason for care:** with a two-step send, step 1 can succeed and step 2 fail, leaving an unsent draft sitting in a real client's mailbox and no email delivered. Decide deliberately and say which you chose: delete the draft and record a failed send, or leave it and record it as needing attention. What must NEVER happen is a silent half-send - a draft in the mailbox that nobody knows about, or a send recorded as successful that never went. **RED-FIRST:** a test asserting a Graph send stores an `rfc822MessageId`, watched failing first; a test asserting a reply carrying that id links by `BY_THREAD_REF`; and a test that makes step 2 fail and asserts the chosen cleanup behaviour actually happens rather than being documented. **DO NOT weaken legs 2 or 3** - they remain the fallback for every historical Graph send, all 267 of which will never have an id. Do not backfill anything. Do not touch the Gmail path. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. **SCOPE:** the Graph send path, its tests, and a dated artefact under `docs/ops/`. No schema change expected. No migration without stopping first. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** either the fix shipped with all three red-first failures quoted then green, deployed and confirmed by commit on the direct origin - OR a written, evidenced NO explaining why the draft id does not survive and why Graph should stay on heuristic matching. Both outcomes close this row honestly; a half-built two-step send does not.

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
  `DONE 143`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 143 - ...** |` reads correctly.
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

* Finished it -> `DONE 143 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 143 - <what is done, what is left>`. PARTIAL
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

Waiting on CI for PR #443 (docs-only queue/state update) before merging.

