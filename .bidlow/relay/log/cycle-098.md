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
