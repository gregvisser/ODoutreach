# Cycle 98 — queue row 87

**A merge-blocking test failed on a timeout, not an assertion. It no longer can.**

One file changed: `relay/cycle-log-reaches-git.test.ts`. No source code, no schema,
no migration, no client data, no email.

## PR sweep, first thing

`gh pr list --state open` returned `[]`. Nothing open, nothing to merge, nothing
left rotting. Recorded because the brief asks for it every cycle.

## What the row said, and where it was right

The row guessed the cause: *"it is likely shelling out per-file rather than once,
in which case the fix is to batch it into a single `git ls-files`."*

That was exactly right, and I verified it against the code before changing
anything rather than taking it on trust. `isTrackedByGit` ran

```
git ls-files --error-unmatch <one file>
```

**inside a `.filter()` over every cycle log.** 96 logs on disk, so 96 process
spawns to answer one assertion.

## Where the row was wrong, and it matters

The row called it *"a slow git call losing a race with vitest's 15 parallel
workers"*, and filed it as a flake. A race is intermittent and stationary. This
is neither.

**The cost is linear in the number of cycle logs, so it grows by one spawn —
about 28ms — every single cycle.** Including the cycle that wrote the row.

| when | logs | test alone |
|---|---|---|
| cycle 76 measured it | ~55 | 1,441 ms |
| cycle 98 measured it | 96 | **2,559 ms** |

Over half the 5,000 ms budget on an *idle* machine, before vitest's workers are
added. It was not waiting for a bad day; it was walking towards the deadline at a
measurable rate, and it would have arrived on its own. QUEUE.md row 87 has been
corrected to say so.

This makes the row's *"do NOT simply raise the timeout"* the right call for a
better reason than it knew: raising it would have bought a fixed number of cycles
and then gone red again, on schedule.

## Measurements — both sides, as the row demanded

**Mechanism, idle machine, 96 logs:**

```
per-file  : 2653ms  (96 spawns, untracked=0)
batched   : 36ms    (1 spawn,   untracked=0, set size=101)
speedup   : 73.6x
same answer: true
```

**Through vitest:**

| condition | before | after |
|---|---|---|
| test alone | 2,559 ms | ~35 ms |
| test in full suite, 15 workers | flaked red at 5,472 ms (cycle 76) | **61 ms** |
| test under 26 competing CPU processes | **FAIL — `Test timed out in 5000ms`, 7,105 ms** | **35 ms** |
| added cost per future cycle | +~28 ms, for ever | ~0 |

## Red first — the honest substitute

The bug is timing, so red-first meant reproducing the failure rather than writing
a failing assertion. Under 26 competing CPU processes the **unmodified** test
produced cycle 76's exact failure:

```
× tracks every cycle log, including the previous cycle's  7105ms
  → Test timed out in 5000ms.
```

The rewrite passes that **identical** load in 35 ms — a 143× margin against the
budget instead of a failure. (14 burners was not enough: the old version survived
at 3,977 ms, 80% of budget. 26 crossed it.)

## Proven to fire, not merely to exist

A fast gate that cannot go red is worse than a slow one that can, and this
repository's recorded house defect is exactly that. So both guards were watched
failing:

1. **The tracking check still catches an untracked log.** Dropped a scratch
   `cycle-999.md` into the log directory — red in 28 ms, naming that exact file
   (`expected [ 'cycle-999.md' ] to deeply equal []`). Removed afterwards; working
   tree clean.
2. **The regression guard fires.** Forced a second git call and it reds with
   *"this check asked git more than once ... Do not answer a red here by raising
   the timeout"*.

**The regression guard counts spawns, not milliseconds, and that choice is the
point.** A duration assertion here would be the same defect class I am removing:
it would pass or fail on how busy the machine is, and would go red on a slow CI
runner having found nothing wrong. The number of times the code shells out to git
is a fact about the code — same answer on every machine, every time.

## Two correctness gains that came free

Neither was asked for; both are real.

* **It no longer swallows a git failure.** The old per-file helper caught every
  error and returned `false`, so a broken or absent git would have reported all
  96 logs as untracked — a loud red pointing at entirely the wrong thing. It now
  throws and says git could not answer.
* **`-z` returns literal NUL-separated paths.** Unflagged, `git ls-files` quotes
  and escapes any path containing non-ASCII or unusual characters, which would
  silently never match a plain string compare — a false "untracked" nobody could
  explain.

## Checked the sibling, deliberately left it

`relay/tracked-artefacts.test.ts` carries the same per-file `isTrackedByGit`
helper. It is **not** this defect: it runs over a fixed list of 8 artefacts, one
spawn per `it.each` case with its own 5,000 ms budget, and it does not grow per
cycle. Rewriting it would have been a second concern in one diff. Noted here so
the next cycle does not have to re-derive that it is safe.

## Gates

```
npm run lint      → 0 problems
npm run typecheck → 0 errors
npm test          → 348 files, 3,644 tests, all passed (31.96s)
```

## Open questions

**Zero.** Nothing here needs Greg: a test file only, no schema, no migration, no
client data, no send.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 98 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: relay/cycle-log-reaches-git.test.ts.

Started 2026-08-29 11:39:13, took about 31.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay/cycle-log-reaches-git.test.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 98 - queue item 87

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **A MERGE-BLOCKING TEST FAILS ON A TIMEOUT, NOT AN ASSERTION, AND IT WILL EVENTUALLY RED A CYCLE THAT DID NOTHING WRONG.** Found by cycle 76 while running the gates for row 44; it has nothing to do with that row and was deliberately NOT fixed in the same breath. `relay/cycle-log-reaches-git.test.ts` > "tracks every cycle log, including the previous cycle's" failed with `Test timed out in 5000ms` at 5472ms. Run ALONE it passes in 1441ms, and a second full-suite run was green - so it is not a real assertion failure, it is a slow `git` call losing a race with vitest's 15 parallel workers. **Why it matters:** this is a required check. A cycle whose own work is perfectly good will one day be told its gate is red, and the honest reading of this repository's rules is that it must then stop and investigate - burning the cycle. That has already happened once for a different reason (row 39, the J5 pacing test before 08:30 UTC), and it cost real time. **Do NOT simply raise the timeout** - that buries the flake and the next machine will just be slower. Find out WHY the git invocation is slow under contention: it is likely shelling out per-file rather than once, in which case the fix is to batch it into a single `git ls-files` and the test gets both faster and deterministic. Red-first is awkward here because the bug is timing, so the honest substitute is to demonstrate the CURRENT test failing under artificial load (or with the timeout lowered to its measured-alone duration), then show the rewritten version passing at the same load with margin. Measure the before and after and put both numbers in the log.

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
  `DONE 98`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 98 - ...** |` reads correctly.
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

* Finished it -> `DONE 98 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 98 - <what is done, what is left>`. PARTIAL
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

`.bidlow/STATE.md` updated and merged — PR #381, green CI, now `3bdf6f5` on `main`. No open PRs.

The record covers what the hook asked for:

- **What changed** — one file, `relay/cycle-log-reaches-git.test.ts`, batched to a single `git ls-files`; shipped `0db2030` (PR #380), verified live by hash.
- **What's half-done** — nothing. Row 87 is `DONE 98` and nothing is owed.
- **Decisions** — the regression guard counts git spawns rather than milliseconds (a duration assertion would reintroduce the same machine-dependent failure); `tracked-artefacts.test.ts` deliberately left alone with the reasoning, so the next cycle doesn't re-derive that it's safe. No one-way doors: a test file, fully reversible via git.
- **Next session** — PR sweep first, then the next `TODO` row; rows 84 and the Google OAuth publish decision remain Greg's, not an agent's.
- **Contradictions with PROJECT.json** — none; the hard rule was never approached (no send, no delete, no client data).

One correction propagated into the permanent record, since it changes how the next cycle should read that row: row 87 described this as a flaky race, and it was not. It was linear growth of ~28 ms per cycle, which is why it would have failed on its own schedule rather than on a bad day.

