# Cycle 78 - queue row 37. The PR was merged a day before I was asked to merge it.

## The short version

Row 37 asked me to rebase and merge PR #297. **PR #297 was already merged on
2026-08-28 at 07:24:05Z**, roughly 24 hours before this cycle started. The branch
is deleted. There was nothing to do.

The brief I was given said it "HAS BEEN OPEN SINCE CYCLE 49 AND IS ROTTING". That
was not true when it was handed to me. The brief itself told me what to do about
that - "If it is wrong, say so in your log rather than working around it, and
correct QUEUE.md" - so that is what this cycle is: a verification, and two rows
closed on evidence.

No code was changed. No schema, no migration, nothing that sends. The only files
touched are `.bidlow/relay/QUEUE.md` and these logs.

## The PR sweep, which came first

`gh pr list --state open --limit 100` returned `[]`. Zero open pull requests,
drafts included. Nothing to merge, nothing red to explain, nothing to leave a
comment on.

That is worth pausing on, because the sweep exists precisely because seventeen
were open on 2026-08-28.

## What I actually verified

I could have stopped at "it says MERGED". I did not, because the row carried one
constraint that could have been violated silently, and a merged PR is exactly
where you would never look for it.

**1. The content is genuinely on `main`.**
`git merge-base --is-ancestor 6a7b3e7 origin/main` returns true. The cycle-49
record is live at `.bidlow/STATE.md:531`.

**2. `a63c2f4` is still not on `main`, and that is correct.**
Row 36 flagged this hash as missing and treated it as a discrepancy. It is a
squash merge - the content landed as `6a7b3e7`, a new hash. The original commit
object still exists locally but will never be an ancestor of `main`. Absence of
`a63c2f4` is not absence of the work, and anyone re-reading row 36 should know
that before chasing it again.

**3. The docs content was NOT edited to make CI pass.**
This was the row's one hard constraint. I extracted the added lines from the
original `a63c2f4` and from the merged `6a7b3e7` and diffed them:

    orig lines: 78  merged lines: 78
    === differences (empty means identical) ===
    IDENTICAL - docs content unchanged by the rebase/merge

**4. The three commits are explained.**
The row described "one commit". At merge the PR had three: `0150c24` (the real
docs commit) plus `6981463` and `9233db7`, both `Merge branch 'main' into
docs/state-cycle-49` - branch-protection "update branch" merges. Two of the three
are not in my local clone at all (branch deleted, then pruned), so I read them
from the GitHub API rather than guessing. Benign.

**5. CI was actually green, both jobs.**
Run [33150705639](https://github.com/gregvisser/ODoutreach/actions/runs/33150705639):
`verify` **pass 3m52s**, `E2E (Playwright)` **pass 5m40s**. Read, not inferred.

A side effect worth recording: this is the docs-only PR that row 39 said was
blocked by the J5 pacing clock dependency. Its E2E job passing is independent
confirmation that row 39's fix (`f3ef2ac`) works on the exact PR it was blocking.

## Row 68, and proving the fix fires

The brief's standing instruction says to assume the seventh "built, wired,
reporting success, never fired" defect exists. Row 68 is the obvious place to
apply that, because it claims a structural fix and its evidence is a promise
about the future ("takes effect on the next relay restart").

So I checked it from both ends rather than trusting it:

- The sweep text lives at `relay-watch.ps1:1288`, with the `gh pr list` instruction
  at 1293.
- The file is committed on `origin/main` at `3d7fef6`, and the on-disk copy has no
  diff against it - durable, not a working-tree artefact.
- **Cycle 78's own brief contained that exact section.** That is the arrival-side
  proof. It did not merely exist; it reached an agent and was executed.

Built, wired, and observed firing. Not the seventh instance.

I then measured the seventeen PRs row 68 names, one `gh pr view` each, this cycle,
rather than trusting a count taken earlier:

- **7 MERGED:** #297, #300, #291, #274, #268, #301, #302
- **10 CLOSED:** #211, #212, #243, #256, #260, #262, #264, #269, #292, #208

Both rows are now `DONE 78`.

## The one thing I am deliberately not claiming

**Ten of the seventeen were CLOSED, not merged.** A closed PR is one whose work
did not land.

For a superseded or hopelessly-conflicting branch that is the right outcome, and I
am not calling it a defect. But "the backlog is clear" and "the work all shipped"
are different sentences, and only the first is proven. I did not open ten closed
PRs to audit whether any carried work still wanted - that is a cycle of its own,
not a footnote to this one. If it matters, it needs its own row. Nothing here
establishes it either way, and I would rather say that than round it up.

## Gates

Nothing was built, so most gates have nothing to bite on. What I ran is what
actually guards the files I changed - the relay's own tests over `QUEUE.md`
parsing, queue file integrity, and the cycle-log-reaches-git rule. Output is in
the commit and in the session transcript.

I did not run `npm run build`. No application source was touched, so it would
prove nothing about this change, and claiming a gate I ran for appearance's sake
is the thing this project is supposed to be least willing to do.

## Corrections made to the record

1. Row 37: `IN PROGRESS 78` -> `DONE 78`, with the staleness stated plainly rather
   than quietly closed.
2. Row 68: `TODO` -> `DONE 78`. Left as TODO, the next cycle would have picked it,
   run the same sweep, found zero PRs, and spent a cycle rediscovering this.
3. Recorded that `a63c2f4` will never be on `main`, so row 36's dangling hash does
   not get re-investigated a third time.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 78 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 00:56:36, took about 8.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 78 - queue item 37

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **PR #297 HAS BEEN OPEN SINCE CYCLE 49 AND IS ROTTING FOR A REASON THAT NO LONGER EXISTS.** Branch `docs/state-cycle-49`, one commit `a63c2f4`, docs-only. It was red for exactly one cause: the hardcoded Sentry DSN, fixed on `main` in cycle 52 (`72a11bd`). VERIFIED by Cowork supervision 2026-08-28: the branch is 2 commits behind `origin/main` and does not conflict yet. This queue already records that a PR left open ROTS - #231 went from clean to 36 commits behind and CONFLICTING in a single day and cost a whole cycle to rescue. This one is docs-only and is now unblocked, so it is minutes of work today and a rescue operation later. Rebase onto `main`, let CI run, merge. Do NOT change the docs content to make CI pass - if it is still red after the rebase, that is a NEW finding and it outranks this row.

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
  `DONE 78`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 78 - ...** |` reads correctly.
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

* Finished it -> `DONE 78 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 78 - <what is done, what is left>`. PARTIAL
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

CI is running on PR #347. I'll merge as soon as it settles — the background watcher will re-invoke me.

**Where this cycle landed so far:**

The item was already done. PR #297 was merged **2026-08-28 07:24:05Z** as squash commit `6a7b3e7`, roughly 24 hours before the brief that told me it was "open since cycle 49 and rotting." The branch is deleted. I closed the row on evidence rather than doing work that didn't exist.

The one thing worth actually checking was the row's hard constraint — *do not change the docs content to make CI pass* — because a merged PR is precisely where that would hide. It holds: the added lines of `a63c2f4` and of `6a7b3e7` are 78 vs 78, byte-for-byte identical. The PR's three commits (vs the "one" the row claimed) are the docs commit plus two branch-protection `Merge branch 'main'` updates.

Two side findings:

- **`a63c2f4` will never be on `main`** — it was squash-merged, so the content landed under a new hash. Row 36 flagged the missing hash as a discrepancy; it isn't one. Recorded so it isn't chased a third time.
- **PR #297's `E2E` job passed** (5m40s), which independently confirms row 39's pacing fix works on the very PR it was blocking.

I also closed **row 68**, because the sweep at the top of my brief *is* its instruction and I ran it: zero open PRs, all seventeen resolved (7 merged, 10 closed). Its structural fix is proven to fire rather than merely exist — the sweep text sits at `relay-watch.ps1:1288`, is committed on `origin/main` at `3d7fef6` with no on-disk diff, and **appeared in this cycle's own brief**. That's the arrival-side proof this project usually skips.

One thing I'm deliberately not claiming: **ten of the seventeen were CLOSED, not merged.** "The backlog is clear" is proven; "the work all shipped" is not. Auditing those ten needs its own row.

Red-first, since the changed behaviour is a file's contents: rewriting row 37's status to `PARTLY DONE 78` turned `queue-file-integrity.test.ts` red on *"writes every status as one of the six words the watcher knows"* — the exact fault that stalled the queue for seventy minutes in cycle 59 — then green on restore.

Gates: lint **0**, typecheck **0**, `npm test` **3160 passed / 316 files**.

