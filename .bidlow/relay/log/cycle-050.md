# Cycle 50 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: relay/queue-parser.test.ts.

Started 2026-08-27 14:59:06, took about 11 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay/queue-parser.test.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 50 - queue item 35

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **`main` IS INTERMITTENTLY RED FROM POWERSHELL-TEST TIMEOUTS, AND A CI THAT IS RED FOR NO REASON TRAINS PEOPLE TO IGNORE IT.** Found by cycle 45 while merging row 12, not looked for. Commit `2de37ff` (cycle 44, already on `main`) FAILED CI: `relay/queue-parser.test.ts` had 2 tests exceed vitest's 5000ms default — including "reads the real status when the status cell itself contains a pipe" — with `Test timed out in 5000ms`, NOT an assertion failure. The very next commit (`14e8e1d`, cycle 45) ran the same tests GREEN on the same runner, so this is flakiness, not broken logic. CAUSE is almost certainly cost, not correctness: `queue-parser.test.ts` and `gate-switch.test.ts` shell out to a REAL PowerShell host per assertion, twice over (`pwsh` AND `powershell`), and each spawn costs ~0.5s locally — on a cold Linux runner `pwsh` startup can exceed 5s on its own. FIX is a per-suite `testTimeout` on the two relay specs that drive PowerShell (they are the only ones paying process-spawn cost), NOT a global timeout bump, which would hide genuinely hung tests everywhere else. Do NOT "fix" this by deleting or skipping the PowerShell-driving tests — they exist because a passing test beside an unfixed script is this repo's worst recorded defect, and they caught a parser bug that cost an overnight cycle. Verify the fix by re-running the suite on CI, not locally, since the timeout only reproduces on the runner.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

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
  `DONE 50`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

I'll wait for CI rather than claim a result I don't have. Summary of where this stands:

## What I found

The brief was right about the cause but **understated the scope**, and I corrected it from the job logs rather than trusting the row:

| | brief said | actually |
|---|---|---|
| occurrences | 1 (`2de37ff`) | **2** — `2de37ff` and `b7ef2a4` |
| files affected | `queue-parser` only | **both** specs, in both runs |
| failing tests | "2 tests in queue-parser" | 1 in each file |

**Cause, sharpened:** in both files, in both runs, the test that blew the budget was the **first `it()` in the file** — later spawns in the same file averaged ~1.2s. It's cold start on the first real spawn (loading .NET, JIT, parsing a full `.ps1`), not the per-assertion cost the brief hypothesised. That distinction matters: it rules out a per-test timeout, because "the first spawn" belongs to whichever test happens to run first, so reordering the file would just move the red line.

## What I did

File-wide `vi.setConfig({ testTimeout: 30_000 })` in the two specs, exactly as the row specified — **no global bump**, nothing deleted or skipped.

**Proving it fires, not that it exists.** A check that the source text says `30_000` would only prove someone typed it — this repo's house defect. So each spec asserts `ctx.task.timeout`, the value vitest *resolved*. Deleting the config line reports `expected 5000 to be 30000`, which is the actual proof that `setConfig` changes the resolved budget.

**Assuming the seventh exists:** the defect that comes back is the *third* relay spec. `relay/powershell-timeout-budget.test.ts` fails if any relay spec naming a PowerShell host lacks a budget clearing a 20s floor — with a non-vacuity test, since a detector matching nothing would pass every check while checking nothing.

Red-first confirmed, then proven capable of failing twice more by deliberate break (config removed → null + 5000; set to `6_000` → below-floor red).

**Gates:** lint 0 · typecheck 0 · 2715 tests / 277 files (was 2710). PR [#298](https://github.com/gregvisser/ODoutreach/pull/298).

## Separate finding — not this item

`main`'s current HEAD (`a63c2f4`, PR #297) is red for a **different** reason: `e2e/screen-walk.spec.ts` fails on `/dashboard` and client-onboarding with `429` during render. It failed **all three retries** — that's a hard failure, not a flake. I'm queueing it as a new row rather than folding it into this cycle.

I'll merge #298 once CI is green, then write both queue rows with the run ID as evidence. Not claiming the CI verdict until I have it — the brief is explicit that this only reproduces on the runner.

**Open questions: 0.**

