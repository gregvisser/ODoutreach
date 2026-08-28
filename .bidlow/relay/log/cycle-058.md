# Cycle 58 — the queue had forked in two, and the relay had stopped

Written as the work happened, not afterwards.

## The job

Two halves. First, make QUEUE.md true: it had split into two different files
carrying the same row numbers. Second, land the pull requests that had been
piling up because CI was red every night.

## What it did

### Part 1 — the queue

**Committed other people's work before touching anything.** The working tree held
Greg's approved Phase 2 plan — rows 40, 41 and 42 — uncommitted, plus an
untracked note the relay had written. One careless command and they were gone.
They went onto a branch first, verbatim, in their own commit (`6d4d187`), before
any reconciliation started.

**Found why the relay had gone quiet.** It had not crashed. Row 38's status said
`SUPERSEDED`, which is not one of the six words it knows (`TODO`, `DONE`,
`BLOCKED`, `PARTIAL`, `IN PROGRESS`, `WONTFIX`). Rather than guess, it refused the
whole queue and left a note saying so at 06:31. It had been stopped ever since —
not stuck on hard work, stopped on one word. Now reads `DONE 58 - superseded`,
same meaning, in a word it can read.

**Merged the two queues.** Rows 1–36 turned out to be byte-identical on both
sides, so only 37 upward had actually diverged. The branch's rows 37–51 moved to
53–67. Numbers 43–52 were deliberately skipped rather than reused, because they
are still in use on that branch — reusing them is exactly how the queue ended up
with two row 46s last week. Every carried row keeps its original wording and
gains one sentence saying what it used to be called.

**Closed three rows that were already fixed, and refused to close a fourth.**
Each was checked against the actual commit on `main`, not from memory:

* The test that failed every night between midnight and 08:30 — genuinely fixed
  by `f3ef2ac`. Closed.
* The mailbox error that said "Microsoft" on Google mailboxes — fixed by the same
  commit. The separate PR built for it (#303) was already closed on its own.
* The unhelpful `callback_failed` message — **only half fixed.** One case now
  explains itself; everything else still returns a shrug, and the code's own
  comment admits it. Marked PARTIAL, not DONE. It would have been easy and wrong
  to close this one.

### The thing nobody expected

While this was in progress, the supervisor wrote a **new row 68** straight into
QUEUE.md, plus a 26-line change to `relay-watch.ps1` — both sitting uncommitted
on disk. The rebuild would have silently erased row 68. It survived only because
the rebuilt file was re-counted and a row that nobody in this cycle had written
was spotted in the list.

Two things write to this file at the same time. That is now recorded at the top
of the queue with the instruction to check before saving. This is the **fourth**
time uncommitted queue work has nearly been lost.

Row 68 says the open PRs are "most green". The measurement below shows that is
not true, so both are kept: row 68 gives the instruction, row 57 gives the facts.

### Part 2 — the pull requests

**The headline figure was stale and too cheerful.** The brief said 14 open, 12
green. Measured per PR from GitHub rather than inferred:

* **17 open, not 14.**
* **Only 2 are both mergeable and green** (#291, #274).
* **3 are mergeable but red** (#302, #300, #297) — all three failed on the
  same night-only test, on a base that predates the fix. They need their branch
  brought up to date and CI re-run, not repairing.
* **12 are CONFLICTING** — their green ticks are from old runs against an old
  base and mean nothing now.

The backlog was not rotting because the PRs were bad. It was rotting because CI
was red on the clock — and then it kept rotting into conflict.

## Honest note

Reconciling QUEUE.md makes the conflicts on the docs PRs *worse*, because most of
them edit this same file. That was a deliberate trade: a queue that tells the
truth is worth more than an easy rebase of a docs PR. They are rescued by taking
`main`'s QUEUE.md wholesale and re-adding only their own row at a free number.

## Gates

`npm run lint` 0, `npm run typecheck` 0, `relay/queue-parser.test.ts` 25/25.
After the rebuild: 57 rows, ascending, no duplicate numbers, every status
readable by the relay, and every description from both source queues present
word-for-word.
