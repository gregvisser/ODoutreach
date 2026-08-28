# Cycle 19 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: src/components/app-shell/app-sidebar.tsx, src/components/clients/client-workspace-subnav.tsx, src/lib/suppression/panel-action-outcome.ts, src/components/suppression/family-proposal-panel.tsx.

Started 2026-08-26 20:35:06, took about 6.5 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md, bidlow/STATE.md, relay-watch.ps1, bidlow/FROZEN.json, src/components/app-shell/app-sidebar.tsx, src/components/clients/client-workspace-subnav.tsx, src/lib/suppression/panel-action-outcome.ts, src/components/suppression/family-proposal-panel.tsx, e2e/global-setup.ts, e2e/screen-walk.spec.ts, e2e/fixtures.ts

## What it was asked to do

# Cycle 19 - land what is already built, and prove the load fix worked

This brief was written by the supervising half of the relay, off QUEUE.md item
27 and the unclosed half of item 31. Greg has not read it. If any of it is
wrong, say so in your log rather than working around it, and correct QUEUE.md.

This cycle builds almost nothing new. Two things that already exist are
unfinished: a green PR that never landed, and a measurement that was recorded
as impossible when the harness to take it is already in this repository.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured, but nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by your
good intentions. If a task seems to need a real send for anyone else, that task
is wrong - stop and write down why.

## Read this before you touch git

The working tree is checked out on `fix/ux-install-banner-and-campaigns-column`,
NOT on `main`. `.bidlow/relay/QUEUE.md` has uncommitted changes in it. Those
changes are MINE, they were made deliberately a few minutes ago, and they are
the current truth: they correct item 31's status cell, put item 27 back to
TODO, and add a new item 32. Do not discard them, do not `git checkout` over
them, and do not resolve them away. Commit them if that is what it takes to
proceed. `.bidlow/STATE.md` and `relay-watch.ps1` are also dirty; leave them
alone.

## Part A - land PR #247. This is the half that is not optional.

Defects (1), (2) and (4) from the live-site UX walk were built and passed CI in
cycle 17 and have been sitting unmerged ever since: the install banner covering
the client-name column on /reporting, `Campaigns` reading 0 for all 17 clients
on /clients, and the client workspace showing the same seven destinations three
times. They are the defects a client sees, and they are finished.

Verified before this brief was written, so you do not need to re-derive it:
the branch is pushed, is 5 commits ahead of `origin/main`, is contained in no
other branch, and contains NO Prisma migration. Merging it will not touch the
client database.

1. Bring `origin/main` into the branch. Expect exactly one conflict, in
   `.bidlow/relay/QUEUE.md`. **Resolve it by taking `main`'s copy of that file
   wholesale and then re-applying nothing** - main's QUEUE.md is strictly newer
   than the branch's and already contains cycle 18's row and my corrections.
   Check `.bidlow/FROZEN.json` too; it has a one-line branch-side addition.
2. Do not revert or weaken anything that arrived from main. In particular
   `prefetch={false}` in `src/components/app-shell/app-sidebar.tsx` and
   `src/components/clients/client-workspace-subnav.tsx` must survive the merge,
   as must `src/lib/suppression/panel-action-outcome.ts` and the "Try again"
   path in `src/components/suppression/family-proposal-panel.tsx`. Grep for
   them after resolving and say in your log that you did.
3. Gates before you claim anything: `npm run lint`, `npm run typecheck`,
   `npm test`. Show the real output.
4. Push, get both required checks green, merge the PR. Branch protection is ON:
   never push straight to `main`.
5. Verify the running commit BY HASH against the DIRECT App Service URL,
   `app-opensdoors-outreach-prod.azurewebsites.net/api/build-info` - never the
   CDN-cached custom domain, and never liveness alone.

If a PR shows no checks, run `gh pr view <n> --json mergeStateStatus` FIRST.
`DIRTY` means conflicted: merge main and resolve. Do not wait on Actions and do
not blame Actions. That misdiagnosis has already cost this project a cycle.

## Part B - close the measurement item 31 left owed

Cycle 18 removed the prefetch stampede and proved the prop is in the compiled
bundle, but recorded the after-measurement as owed and unobtainable, on the
grounds that it could not drive a signed-in browser. **That is wrong, and it is
the reason this part exists.** `e2e/global-setup.ts` and
`e2e/screen-walk.spec.ts` already sign in and walk the app, and that suite runs
as a required check on every PR. The measurement can be a test.

Write it as one. Files: a new spec under `e2e/`, using the existing signed-in
fixtures from `e2e/fixtures.ts` - do not invent a second sign-in path.

* **The red-first test, and you must watch it fail before you make it pass:**
  open a client workspace screen signed in, count the responses whose URL
  carries `_rsc`, and assert the count is at or below a small ceiling that a
  page with no link prefetching would produce. Prove the assertion is capable
  of going red by temporarily deleting `prefetch={false}` from
  `client-workspace-subnav.tsx`, watching it fail, and restoring it. That
  deliberate break is this repository's established substitute and cycle 18
  used it successfully - do the same here and show both outputs.
* Record the number you actually observe, before and after, in the log and in
  item 31's row. The before-figure on record is ten concurrent `_rsc` requests,
  of which ten returned 503 on production.
* **Measure before you change anything else.** If the count is already low, the
  item is closed and you stop. Do NOT go on to tune performance, add caching,
  change revalidation, or touch `/reporting`'s load time on the strength of an
  assumed cause. The one measured cause on record is a single B1 worker
  serialising the burst, and the two remedies for that - scaling the plan and
  toggling Always On - are Greg's calls, not yours. Leave them.
* Do NOT add retries, timeouts or waits that would mask a 503 rather than
  reveal one.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them.
2. **The red-first test.** Named above for Part B. Watch it FAIL first.
3. **What "done" looks like**, in one sentence a non-coder can check:
   the install banner no longer covers the client names on /reporting and
   Campaigns no longer reads 0 for every client on the live site, and there is
   a test that fails if the prefetch burst ever comes back.
4. **What you must NOT touch.** The App Service plan, the Always On setting,
   `/reporting`'s query shape, anything under `prisma/migrations/`, the other
   queue rows, and the uncommitted `relay-watch.ps1` and `.bidlow/STATE.md`.

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, an
  irreversible one-way door - stop and write down the question instead.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true. This
  cycle should introduce no migration at all; if you find yourself needing one,
  stop and say so.
* When you finish, update item 27's row in `.bidlow/relay/QUEUE.md` to
  `DONE 19`, or back to `TODO` with a note if you could not do it, and update
  item 31's row with the measured after-figure. **Both rows must keep exactly
  four pipe characters** - a stray pipe inside a status cell is what stalled the
  relay this evening. Do not put a pipe character in a status cell.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. PR #247 is a seventh shape of the same disease: it
was built, it went green, it was recorded as ready, and it never reached a
single user. Whatever you touch this cycle, prove it LANDED and is RUNNING -
not that it exists in a branch.


## What it did

I'll wait for the build/e2e notification rather than poll.

