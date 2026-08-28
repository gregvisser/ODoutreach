# Cycle 18 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.



Started 2026-08-26 19:43:40, took about 26.4 minutes.

How it ended: exit code 0.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 18 - queue item 31

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **MEASURED ROOT CAUSE OF "THE SYSTEM TAKES VERY LONG TO LOAD" — PRODUCTION SHEDS CONCURRENT REQUESTS WITH 503, AND IT ALREADY BROKE A BUTTON IN FRONT OF ME.** Measured on the live site 2026-08-26 evening, signed in, after cf5a752 was deployed and verified by hash. **What happens:** Next.js prefetches every visible sidebar and tab link on page load, so opening one client screen fires about ten concurrent server-rendered `?_rsc=` requests. Production answers most of them **503**. Captured, one page load: 503 on `_rsc` for /clients, /reporting, /suppression, brief, mailboxes, sources, contacts, templates, outreach, activity; 200 on /support, /training, manifest, icons. **Consequence 1:** the prefetch cache stays empty, so every tab click is a cold full server render instead of an instant client navigation. That is the slowness Greg reported, and it is NOT the render cost we assumed. **Consequence 2, and this is the demo risk:** the new "Find related domains now" button posts a Next.js **server action to the page URL**, and that POST was shed too — captured verbatim: `POST /clients/cmob909.../suppression → 503`. The button IS correctly wired (the POST proves it fires — this is not another dead button), but the run never completes, the panel keeps saying "No suggestions waiting", **and the screen shows the operator nothing at all: no error, no spinner, no "that failed, try again".** If Greg presses it in tomorrow's meeting during a prefetch burst it will look broken. **Not a routing rule — it is load shedding.** Requested serially a moment later, the same four paths returned 200 twelve times out of twelve, but slowly: clients 324/213/398 ms, reporting 380/414/1609 ms, mailboxes 1890/652/2381 ms, suppression 2230/3020/5200 ms. So the app is fine one request at a time and falls over in a burst. **THREE THINGS, in this order.** **(1) Make the failure visible.** A server action that fails must say so on screen and offer a retry. Silent failure is the same defect class as a button that was never wired — worse, because it looks wired. Red-first: a test that asserts the panel renders an error state when the action rejects. **(2) Stop the stampede.** Set `prefetch={false}` on the sidebar and client-tab links, or otherwise stop ten server-rendered prefetches firing at once. Measure before and after with `performance.getEntriesByType('navigation')` and the `_rsc` status codes — do not claim an improvement you did not measure. **(3) Check the App Service plan.** Find the tier and instance count for `app-opensdoors-outreach-prod`. If it is sheddding at ten concurrent requests it is too small for a demo, let alone for real use; scaling up for tomorrow is cheap and reversible. Record what the plan actually is — do not guess. **Do not "fix" this by adding retries that hide the 503.**

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
  `DONE 18`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



`.bidlow/STATE.md` updated with the cycle 18 section.

The background local production build also finished — **exit code 0**. That confirms the bundle I grepped for `prefetch:!1` came from a clean, complete build rather than a partial one.

State recorded, in the terms the hook asked for:

- **Built/changed** — `panel-action-outcome.ts` + the panel's alert/retry, `prefetch={false}` across both nav components, three test guards; merged `11a9a93`, live and hash-verified.
- **Half-done, and exactly where** — the `_rsc` re-measurement on a signed-in client screen. Not claimed, not started; can't drive an authenticated browser from here. Two minutes in DevTools closes item 31.
- **Decisions** — did not scale the plan (money), did not toggle Always On (restarts the live app before your meeting), did not add a DOM test harness (scope creep). No one-way door, no migration, no mail, no deletes.
- **Contradicts PROJECT.json** — nothing.
- **Pick up first** — the re-measurement; then your answer on Always On/sizing; then a sweep for the same silent-rejection hole elsewhere, since `startTransition(async () => await someAction())` has the identical defect everywhere it appears.

That last one is worth flagging beyond the file: I fixed one panel, but the pattern is repo-wide, and it is the exact defect class the queue says this project is worst at.

**Open questions: 3** — scale the B1 plan, toggle Always On, and who runs the live `_rsc` re-measurement.


