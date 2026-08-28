# Cycle 52 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-27 16:47:35, took about 31.9 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: e2e/screen-walk.spec.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 52 - queue item 36

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **A HARD (NOT FLAKY) E2E FAILURE WAS REPORTED ON `main` AND NEVER WRITTEN DOWN.** Cycle 50 reported, as a side finding while doing row 35, that `e2e/screen-walk.spec.ts` fails on `/dashboard` and on client-onboarding with a **429 during render**, and that it failed **all three retries** - which is what separates a hard failure from a flake. Cycle 50 said it would queue this as a row and then did not, so it existed only inside one log file. Two things about that report are unconfirmed and must be treated as claims, not facts: it named `main` HEAD as `a63c2f4` (PR #297), but `origin/main` is `be2dc01` (PR #296) and `a63c2f4` is not on `main` at all - so it may have been reading a different ref. **MEASURE BEFORE FIXING.** Reproduce the 429 and capture which request returns it and from what - an upstream API, a middleware rate limiter, or the test harness hammering the app - before changing a line. The cause is currently ASSUMED, not known. Do not raise a limit, add a retry, or mark the spec flaky until the source of the 429 is named with evidence.

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
  `DONE 52`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Done. Row 36 is `DONE 52`, merged and deployed.

## The 429 was ours

The brief named three suspects — an upstream API, a middleware rate limiter, or the harness hammering the app. All three were wrong, so measuring first genuinely mattered.

Before changing a line, I recorded every off-origin request during a `/dashboard` load. It fired **seven POSTs** to `o4511767741071360.ingest.de.sentry.io` — our own Sentry DSN, hardcoded in `src/instrumentation-client.ts`, writing into **the client's production Sentry project from the test environment**.

**Why nothing caught it:** `e2e/env.ts` makes a real send impossible by blanking environment variables — so it only covers destinations configured *from the environment*. The DSN was a string literal in the source. The guard could not see it, and never had. At `tracesSampleRate: 1`, every CI run spent the client's ingest quota; once exhausted, Sentry rate-limited the browser. **A quota stays exhausted, which is exactly why it failed all three retries instead of flaking.**

## Two corrections to the queue row

- **The failure was never on `main`.** The red run was on `docs/state-cycle-49` — an open, docs-only PR (#297). `a63c2f4` is real, but on that branch. Your suspicion was right. `main` was green by luck of quota timing, not correctness — the cause was in its own source.
- **The failing assertion was the `console.error` check, not the navigation status.** The pages rendered fine. "429 during render" described timing, not a broken screen — which would have sent a reader hunting through page code for nothing.

## What I did

DSN moved to `NEXT_PUBLIC_SENTRY_DSN`; set as a **literal** in `deploy-production.yml` (a DSN is public by design, and a missing secret would have silently killed monitoring); blanked for e2e; `tracesSampleRate` 1 → 0.1 (performance traces only — error capture is untouched). No limit raised, no retry added, no spec marked flaky.

## Proving it fires, not that it exists

The 429 depends on a quota that refills, so it is not reproducible on demand — asserting the symptom would have given a test that passes for the wrong reason. The new guard asserts the deterministic precondition: **zero off-origin requests**. It went red first naming the exact ingest URL, then green locally and on the runner.

The riskiest part was that gating a DSN on an env var is an easy way to kill a client's error monitoring while every gate stays green. So I checked both directions: **0 bundle chunks with the var unset, 2 with it set** — and then grepped the **live deployed JavaScript**, where the DSN is present. Monitoring is alive.

Gates: lint 0 · typecheck 0 · **2715 tests / 277 files** · full e2e **66 passed**. Merged as `72a11bd`, deployed and verified by hash against the direct App Service URL. The two previously-failing screens now pass first attempt, no retries.

Two things for you rather than for me:

- **PR #297 has been open since cycle 49 and was red for this reason alone.** It is docs-only; a rebase should now make it green. You've flagged that open PRs rot.
- `.bidlow/relay/log/` is **gitignored** — which is structurally why cycle 50's finding "existed only inside one log file". QUEUE.md is the only durable channel, so I put the full evidence there. Worth knowing that any finding written only to a cycle log will be lost the same way.

**Open questions: 0.**

