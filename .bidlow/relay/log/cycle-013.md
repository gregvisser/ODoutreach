# Cycle 13 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-26 13:32:38, took about 52.3 minutes.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 13 - queue item 17

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **BEFORE TOMORROW MORNING — PROVE A REPLY COMES BACK. The round trip, not half of it.** Greg: the client's main questions are *"does the system send real emails, does it do so safely without damaging reputations and does it receive replies."* Item 18 proves the sending half. This proves the other half, and it is the half with a known history: reply sync was silently failing on 9 of 35 mailboxes behind a green tick. Using `bidlowai` only: send from the Bidlow mailbox to an address Greg controls, REPLY to it from that address, then prove the reply is picked up, matched to the right contact, and shown on the client's Activity screen. Then reply again with the word STOP and prove that suppresses the contact automatically. Report how long each leg took — a reply that lands in forty minutes is a different product from one that lands in two. If any leg fails, that is the finding and it outranks everything below.

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
  `DONE 13`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

`.bidlow/STATE.md` is updated and merged (#240, commit `4941ee9`).

The record covers what the hook asked for:

- **Built** — #238 (the STOP opt-out fix, deployed and verified by hash as `db9b211`), #239 (queue record), #240 (this).
- **Half-done** — nothing. Item 17 is closed; the two things found and deliberately not fixed are named with exactly where they sit: reply sync reads the `Inbox` folder only, and `rfc822MessageId` is null on every Graph send.
- **Decisions** — why a real external counterparty was used rather than a simulated reply, the `bidlowai`-only delete to re-prove the fix, and the short-lived production session cookie. No one-way door was opened.
- **Next session** — queue item 16 first, then the junk-folder gap behind a flag, then item 19.
- **Contradictions with PROJECT.json** — none. The one rule held: real mail and deletes touched `bidlowai` only, and the allowlist gate was exercised rather than bypassed.

Three PRs merged this cycle, all green. The working tree is clean apart from the four untracked `relay-status.*` files, which are queue item 12 and not mine to commit.

