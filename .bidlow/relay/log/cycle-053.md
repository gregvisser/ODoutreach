# Cycle 53 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-28 03:32:18, took about 29.6 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: e2e/no-third-party-telemetry.spec.ts, relay/tracked-artefacts.test.ts, relay-watch.ps1, bidlow/STATE.md

## What it was asked to do

# Cycle 53 - queue rows 37 and 38

Written by Cowork supervision at 2026-08-28 02:35 UTC, after verifying cycle 52
against git and the files on disk rather than against its own log. Greg has not
read this. If any claim below is wrong, say so in your log and correct QUEUE.md
rather than working around it.

## What was verified before this was written

Cycle 52 is real work, not a claimed success. Checked, not taken on trust:
`72a11bd` is on `main`; all three Sentry configs now read
`process.env.NEXT_PUBLIC_SENTRY_DSN`; no hardcoded DSN survives anywhere under
`src/`, `e2e/` or `scripts/`; `e2e/no-third-party-telemetry.spec.ts` exists and
asserts zero off-origin requests; `tracesSampleRate` is 0.1. Rows 1-36 of
QUEUE.md are all genuinely DONE and none is stuck on IN PROGRESS.

The relay then wrote SELF-QUEUE-NOTE.md saying the queue was exhausted and
correctly refused to invent work. It was right about the queue and wrong that
there was nothing to do: cycle 52's own log ends with "two things for you rather
than for me", and neither was ever written into QUEUE.md. They are now rows 37
and 38, and they are this cycle.

## Why these two are one item and not two

Both are the same failure wearing different clothes: **this project's record of
its own work does not reliably land.** Row 37 is a cycle record stuck in an
unmerged PR. Row 38 is the channel that cycle records are written to being
invisible to git. Fix the instance, then fix the mechanism.

## THE ONE RULE, VERBATIM AND NOT NEGOTIABLE

Real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every
other client may be built on, tested and measured, but nothing leaves the
building for them.

This is enforced in `autonomous-actor-guard.ts`, not by your good intentions. If
a task seems to need a real send for anyone else, that task is wrong - stop and
write down why. Neither part of this cycle should send anything at all.

## Part A - row 37. Do this FIRST. Time-box it to 20 minutes.

Branch `docs/state-cycle-49`, PR #297, one commit `a63c2f4`, docs-only. As of
02:30 UTC it is 2 commits behind `origin/main` and does NOT conflict. It was red
for exactly one cause, and cycle 52 fixed that cause on `main`.

Rebase onto `main`, push, let CI run, merge. That is the whole of Part A.

If CI is still red after the rebase, **stop Part A there**. Do not touch the
docs content to make it pass. A docs-only PR that is red for a second, unrelated
reason is a new finding about CI, it outranks the rest of this cycle, and it goes
into QUEUE.md as its own row before you do anything else.

If it has started conflicting since this was written, say so plainly - that is
the rot this row predicts, arriving early.

## Part B - row 38. This is the substantial half.

`.gitignore:107` ignores `/.bidlow/relay/log/`. Cycle 50 wrote a hard E2E
failure into its cycle log and nowhere else; the finding was invisible to
everything downstream, and cycle 52 spent its reconnaissance re-deriving it.

**Do not treat this as an obvious bug with an obvious fix.** The ignore rule was
put there deliberately, in the block for local and transient files, next to
`NEXT.md`, `CURRENT.md`, `HALT` and `STATUS.json`. `relay/tracked-artefacts.test.ts`
argues at length why a glob over `.bidlow/**` was rejected in favour of a named
list. Someone thought about this. The cause of the loss is known; the right
remedy is NOT, and you must not assume it.

### Measure before you change a line

Write all three numbers into your log before choosing anything:

1. **Secrets.** Scan all 53 existing logs for credential-shaped strings - tokens,
   bearer headers, connection strings, DSNs, anything that came out of a gate.
   Tracking a file puts it in the object store permanently. If even one log
   carries a secret, "just commit the logs" is off the table for the back
   catalogue and you must say so.
2. **Size of the actual problem.** How many existing logs contain a finding that
   was never mirrored into QUEUE.md? If the honest answer is one - the cycle 50
   case we already know about - then the cheap remedy wins and the expensive one
   is not justified. Report the real count, including if it is one.
3. **Volume.** Total bytes and file count in `.bidlow/relay/log/`.

### Then choose, between at least these two, and record which and why

* **Track the logs**: remove or narrow the ignore rule, and make the watcher
  commit its own log as part of closing a cycle.
* **Enforce QUEUE.md as the only durable channel**: leave logs ignored and make a
  cycle unable to close while its log contains a finding not mirrored into
  QUEUE.md.

Either is defensible. An unrecorded choice is not.

### The trap, and it is this project's worst defect class

**Deleting the ignore line makes logs trackable. It does not make them tracked.**
A log nothing ever commits is still invisible to a rebase and still deleted by
`git clean -fd`, and the gate would report success having changed nothing. That
is the eleventh instance of "built, wired, reports success, never fired" and it
is exactly how this row would fail.

So whatever you choose must be proved to FIRE on a real cycle - a log or a
mirrored finding that actually reaches git, shown by hash - not proved to exist.

## Before you touch anything, write these four things down

1. **The files you will change.** Expected: `.gitignore`,
   `relay/tracked-artefacts.test.ts` or a new sibling test beside it, and
   `relay-watch.ps1` if the choice makes the watcher responsible for committing.
   If Part B's measurement sends you somewhere else, name where instead.
2. **The red-first test.** Name the file and what it asserts. It must go RED
   against today's tree - a test that asserts a cycle log reaches git will fail
   today because of `.gitignore:107`, which is the point. Watch it fail before
   you make it pass. If the behaviour genuinely cannot go red first, break the
   code deliberately and show the red; that is this repository's established
   substitute.
3. **What "done" looks like**, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside (1). Specifically off-limits
   this cycle: `autonomous-actor-guard.ts`, the Sentry configs, anything under
   `src/`, and `e2e/no-third-party-telemetry.spec.ts` - cycle 52 just landed
   that and it is not yours to adjust.

## The standing rules still apply

* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Branch -> PR -> green CI -> merge. Never push straight to `main`.
* **Merging is yours.** With green CI, merge without asking. A finished green PR
  left open rots - row 37 exists because of exactly that.
* Only three things stop and ask: (a) a destructive migration, (b) anything
  touching or moving real client data, (c) anything causing an email to be sent.
  Nothing in this cycle should come near any of the three.
* `.bidlow/STATE.md` is currently modified and uncommitted, and
  `SELF-QUEUE-NOTE.md` is untracked. Commit or clean them as part of your PR -
  loose working-tree state is what row 38 is about.
* When you finish, set rows 37 and 38 in QUEUE.md to `DONE 53`, or back to `TODO`
  with a note saying what stopped you.
* Do NOT write the next NEXT.md. The watcher does that.

## Assume the eleventh exists

QUEUE.md records ten instances of something built, wired, reporting success, and
never firing. Row 38 is a near-perfect setup for the eleventh. Prove what you
build FIRES.


## What it did

Done. Working tree clean, everything pushed.

## What happened

**Part A — PR #297: rebased, not merged.** It rebased onto `main` cleanly with no conflicts (the rot this row predicted hadn't arrived — still only 2 commits behind), force-pushed as `0150c24`. CI came back red again. The Sentry 429 is genuinely gone, so cycle 52's fix holds — but a **second, unrelated** failure surfaced. Per your instruction I stopped there, did not touch the docs, and wrote it up as its own row.

**The new finding (row 39).** The J5 critical-journey test is **deterministically red between 00:00 and ~08:30 UTC** — exactly when the relay runs. Send pacing permits sends only in a 07:00–18:00 UTC window; the test fixes dates for its *setup* rows but lets the send read the real wall clock. Measured, not reasoned: I probed the pure function — 00:35→0, 02:35→0, 06:35→0, 07:35→0, 09:35→4, 17:35→10. Zero allowance means the send can't be placed, so `blocked` is non-empty and the assertion fails. Every recent green run on `main` ran 11:00–16:00 UTC, which is why nobody saw it. Confirmed on **two unrelated branches** (#297 and #300), 1 failed / 121 passed in both, `verify` green in both — two branches sharing nothing but the hour. The fix lives in `src/`, which your brief put off-limits, so I recorded it rather than working around it. The product is fine; this is a test-harness defect.

**Part B — measured first, then chose.**

- **Secrets: zero** across all 55 records. The DSN public key appears in 0 logs; the 40-char hex strings were git SHAs. So the objection that would have blocked tracking doesn't apply.
- **Findings lost: four, not one** — so the cheap answer wasn't available. One (`...supervision-row20.md`) was unmirrored *while I worked*, carrying a 31 Aug deadline.
- **Volume:** 364,963 bytes, ~6.5 KB/cycle.

I chose **tracking** — but the measurement changed the mechanism. **I did not change `relay-watch.ps1`**, which departs from your expected file list. A watcher-side commit must pick a branch itself; on `main` that's a local commit branch protection won't push, which the next cycle's `reset --hard` wipes — recreating the loss. Instead the enforcement is the gate every cycle already runs: the spec asserts every log is tracked **with no exemption for the newest**, so cycle N+1 opens red naming cycle N's log.

**Proved it fires**, not that it exists: red first (2 failed, 50 logs listed) → green after committing the catalogue → then an untracked `cycle-999.md` dropped in as the watcher writes one turned it red naming that file. And by hash out of the object store: `cycle-050.md` = `f1f7bef`, with the lost paragraph read back from git, not disk. An earlier draft *did* exempt the newest log — I caught that before shipping, because during cycle N+1 the newest log *is* cycle N's, so the one file needing forcing would have been the one excused. That would have been the eleventh.

**The honest limit, not buried:** this fixes durability, not attention. `cycle-050.md` was never deleted — it's on disk today — and cycle 52 still re-derived it. That residual is row 40, left open rather than quietly claimed.

## Three things you should know

1. **Row 38 is `TODO`, not `DONE 53`.** The work is built and proven and `verify` passed on the runner, but PR #300 isn't merged — blocked by row 39. This queue's own lesson is that an unmerged PR isn't finished, so I didn't round up.
2. **I made a mistake and undid it.** A verification probe of mine called `Invoke-SelfQueue`, which *mutates*: it stranded row 41 as `IN PROGRESS` with an empty cycle number (a state the watcher's reopen logic can't recover) and wrote a premature `NEXT.md`. Both reverted; re-verified 0 unparsed rows, 0 stuck. The re-run probe was read-only.
3. **Row 41 appeared mid-cycle**, written concurrently while I was editing QUEUE.md — the exact hazard the row-20 note flagged. It's also the first TODO in file order, so the relay picks it next and would find "green" PRs red from row 39. I cross-referenced it rather than reordering.

Also cleared a stale 0-byte `packed-refs.lock` (same class as the `index.lock` that stopped cycle 51), landed cycle 51's uncommitted STATE.md, and deleted the stale `SELF-QUEUE-NOTE.md` (its "queue is exhausted" claim is now false; superseded by NEXT.md, and the supervision note recording it is now tracked).

Gates: **lint 0 · typecheck clean · 2719 tests / 278 files**. No schema, no migration, no send path, no client data. Nothing left the building for anyone.

**Open questions: 1** — row 39's fix is in `src/`, which this cycle's brief put off-limits, so I left it. It now blocks at least two PRs and every overnight one. Do you want the next cycle to take it ahead of row 41, or should the off-limits boundary hold?

