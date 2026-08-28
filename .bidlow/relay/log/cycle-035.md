# Cycle 35 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.



Started 2026-08-27 06:33:55, took about 22.2 minutes.

How it ended: exit code 0.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 35 - queue item 24

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **BY 31 AUG (NOT tomorrow) — DELIVERABILITY REVIEW, AS A DOCUMENT FOR THE CLIENT.** All the findings exist across STATE.md: the quarantine root cause, the ~4-5% real bounce rate, the 426 unread bounces, the 8 dead mailboxes, the warm-up anchor defect. There is no document. Produce one Greg can send to Sam and James — plain English, no jargon, what was wrong, what was fixed, what remains.

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
  `DONE 35`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



Cycle 35 complete. Queue row 24 is `DONE 35`, merged and live.

## What was delivered

**`docs/client/2026-08-27-deliverability-review.md`** — the document Greg can send to Sam and James. Plain English, three sections in the order the item demanded: what was wrong, what has been fixed, what is still outstanding. All six findings, each with the mechanism explained rather than named:

1. Our links made the customers' emails look like phishing (the quarantine cause) — **fixed**
2. The 0% bounce figure was reading the wrong field; protection worked, the number didn't — **still open**
3. 426 bounce notifications collected and never read, because Gmail bodies were never downloaded — **fixed**, and it surfaced that opt-out detection was reading ~6% of every reply on Microsoft too
4. The real bounce rate is ~4-5% — written down as **an estimate, not a measurement**, with the reason it cannot be narrowed
5. Eight dead mailboxes, five of them Train Hugger's, two permanently deleted — reporting **fixed**, mailboxes **not reconnected**
6. No mailbox had ever been warmed up; the ramp measured age, not sending — **fixed**, and the document states the cost plainly: everything restarts at 5/day, 30/day is five working weeks away, fleet capacity is ~275/day not 1,350

The queue item was accurate — the two existing audits are engineering-facing and predate five of the six findings.

## Proving it fires

A document has no runtime behaviour, so I pinned its load-bearing sentences to the code in `src/lib/docs/deliverability-review.test.ts` (12 tests). Red-first: 4 assertions failed before the document existed. Then I fired both ratchets deliberately — added a `status: "BOUNCED"` write to `bounce-detection.ts`, and re-imported `resolvePublicBaseUrl` into `send-introduction.ts` — both went red naming the exact claim, then reverted.

The ratchet worth keeping: the test asserts the bounce status write is **still absent**. When someone fixes it, the build goes red and names the paragraph of the client document that must be corrected before it is sent again.

One real test bug found on the way: my first regex **falsely reported the quarantine root cause was back**, because it matched the comment that deliberately names `resolvePublicBaseUrl` to explain why it must never be imported. Replaced with a comment-stripped absence check plus a sanity assertion so it cannot pass vacuously.

## Gates and verification

- lint 0 errors (1 pre-existing warning in the untracked `relay-status.mjs`), typecheck clean, **2549 tests / 261 files**
- CI green on both `verify` and `E2E (Playwright)`; merged via PR #275
- Production serves **`d4e4fc4`**, verified by hash against `app-opensdoors-outreach-prod.azurewebsites.net/api/build-info`; health `ok`, database `ok`
- Live config read back before writing: `OPEN_TRACKING_PIXEL=off`, `MAILBOX_WARMUP_RAMP=on`, bounce/complaint detection `true`, `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN` unset. The eight mailboxes are still out — `sync-replies` run `33002377746` reads `27/27/0`
- The hard rule held: **no mail sent for any client**, no schema, no migration, no config change. The relay gate is untouched (`active: true`, 1 allowlisted client)

**Open questions: 2.** (1) Who chases the six expired Google sign-ins and decides the fate of the two deleted Chevron Security accounts — the document asks, but it is a client-relationship call. (2) Whether Greg wants the document reviewed before it goes to Sam and James, since it names OpensDoors' own customers and their bounce rates.


