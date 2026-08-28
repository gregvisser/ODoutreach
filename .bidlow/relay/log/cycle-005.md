# Cycle 5 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: docs/ops/LOAD-SPEED-MEASUREMENT.md.



Started 2026-08-26 08:30:34, took about 30 minutes.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: docs/ops/LOAD-SPEED-MEASUREMENT.md, bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 5 - queue item 3

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **Load speed — fix (code side only).** The measurement cleared the suspect: `loadClientWorkspaceBundle` is a CONSTANT 19 round-trips at 1/6/20 mailboxes, no N+1. Two small code items remain: `getAccessibleClientIds` scans the whole `Client` table unbounded on every page, and `ClientMailboxIdentity` is queried 4x per load when the bundle already holds it. Both are tidy-ups, NOT the cause. Read `docs/ops/LOAD-SPEED-MEASUREMENT.md` first.

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
  If the decision is genuinely Greg's - money, a client relationship, an
  irreversible one-way door - stop and write down the question instead.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 5`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



Cycle 5 complete. Queue item 3 is `DONE 5`, merged as `7f6fdf5`, and live in production.



## What I did



The two code tidy-ups the queue named — and nothing more, because the measurement was explicit that neither is the cause.



| | before | after |

|---|---|---|

| SQL round-trips per workspace page | 19 | **17** |

| `ClientMailboxIdentity` reads | 5 | **3** |

| Whole-table "every live client" scans | 1 | **0** |



`getAccessibleClientIds` read every live `Client` row to answer "may this staff member touch *this one* client?" — twice per page. Single-client checks now use a new `canAccessClient` (one indexed row). Both build their `where` from a shared `accessibleClientWhere` predicate, so the tenant wall can't drift between them if it's ever narrowed to `ClientMembership`. And the bundle already held `client.mailboxIdentities`, yet two helpers re-read exactly those rows; both now take the rows the caller holds. The send path is untouched.



## Proving it fired



Test written first, watched **red** against the unfixed code — `expected 5 to be less than or equal to 3` — then green. It runs in CI's e2e job, so a regression breaks the build.



Gates, all run: lint 0 errors · typecheck clean · 2197 unit tests · 94 integration tests · build · CI green on both jobs · deploy green · **production verified as `7f6fdf5` by hash on the direct App Service URL** (health `ok`, database `ok`).



## Two corrections rather than workarounds



- The queue and the cycle-4 doc said the mailbox list was read **4×**. It was **5** — cycle 4 misread its own grouped output. Corrected in both.

- One real behaviour change, flagged not buried: when a workspace has several sendable mailboxes and none is primary, the "sending from" **display** now picks deterministically instead of in Postgres row order. Sending itself is unchanged.



## The honest headline



**Nobody will feel this.** The bottleneck is still the single Basic B1 core at ≥90% CPU in 43% of hours. I've said so in the commit, the PR, the doc, the queue's standing findings, and the plain-English log at `.bidlow/relay/log/cycle-005.md`.



One process note: PR #225 (cycle 4) had already merged — my local `origin/main` was stale, so the branch needed a merge and three conflict resolutions. All gates were re-run on the merged tree before pushing.



**Open questions: 3** — all yours, none of them code. Turn Always On on (free, one checkbox, recommended yes); move off B1 (a cost decision, and the highest-impact change available); open Sentry Performance, where `tracesSampleRate: 1` means every production request is already traced and nobody has looked.



