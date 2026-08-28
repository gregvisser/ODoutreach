# Cycle 16 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.



Started 2026-08-26 16:41:52, took about 31.7 minutes.

How it ended: exit code 0.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 16 - queue item 29

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE DEMO CLIENT CANNOT DEMO. `bidlowai` HAS NO SEQUENCE AT ALL, AND THE SCREEN SAYS "READY TO LAUNCH" ANYWAY.** Found 2026-08-26 on the live site. `bidlowai` is the ONLY client the hard rule allows to send real email, so it is the only client Greg can show sending live tomorrow. Its Outreach tab says, verbatim: *"No sequences yet."* **And the workspace overview contradicts itself on one screen.** It shows a green **"Ready to launch"** badge, Workflow pill **"6 Outreach — complete"**, and Launch readiness **"Outreach · Ready · Ready to launch"** — while, lower on the SAME page, the Getting started checklist says **"5 / 8 complete"** with steps 5, 6 and 7 undone: *Write the introduction*, *Build a launchable sequence*, *Enroll contacts into the sequence*, under the sentence *"Workspace setup is incomplete."* A readiness rail that reports Ready with zero sequences is not a cosmetic bug — it is the rail whose whole job is to say whether it is safe to launch. Compare `opensdoors`, where the same rail correctly says *"Ready to launch · launchable production sequence"* against 10 real sequences. **TWO THINGS TO DO, in this order.** **(a) Fix the lie.** Find what feeds the Outreach section of the launch-readiness rail and the Workflow pills, and make "Ready" require at least one sequence with an introduction step and at least one enrolled recipient. Red-first: a test that asserts a client with zero sequences is NOT reported ready. This is a correctness bug, so it comes before the content. **(b) Build `bidlowai` a real, launchable sequence and stage it — but DO NOT LAUNCH IT.** Greg asked for this directly: *"if the bidlow client needs a campaign built along with sequences, let that be included for claude code to fill in everything."* So: write an introduction template (and one follow-up) from the BidlowAI brief, assemble them into a sequence, attach the existing list, enroll the eligible contacts (2 of 3 — one is suppressed, leave it suppressed), resolve recipients, and generate the pre-send preview so the exact email is visible on screen. Leave the sequence in draft/ready with the launch button armed and unpressed. **The send is Greg's click in the meeting, not yours** — the owner seeing him press it and the email arrive is the whole demo, and an overnight autonomous agent sending real cold outreach to real people is not a decision the relay gets to make. Note BidlowAI has 1 connected mailbox at 30/day, so capacity is not a constraint for a handful. **DONE looks like:** Greg opens BidlowAI → Outreach tomorrow, sees one sequence with recipients ready, clicks Generate preview and reads the actual email, then clicks launch and it sends. Prove it by walking that path yourself up to — and not including — the launch.

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
  `DONE 16`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



Cycle 16 complete. Here's where it landed.

## (a) Fix the lie — done, PR #245, **not merged**

The queue item was accurate. `outreachPilotRunnable` is a **mailbox** fact:

```ts
bundle.hasGovernedMailbox && bundle.oauthReadyForGovernedTest && bundle.poolCanSendPilot
```

It asks "could a governed mailbox send something today?" and never looks at sequences, steps or enrolments — yet it was the readiness signal for all four contradicting surfaces. BidlowAI has one connected mailbox, so it was `true`, and the whole module reported ready on that alone.

**The finding worth keeping:** the *gate* was never wrong. `evaluateClientLaunchApproval` has always required a launchable sequence and an enrolment. Only the display disagreed with it. And both call sites were **already loading both signals** — then dropping the enrolment count before building the snapshot. A query whose result is discarded is indistinguishable from one never written; that's the same shape as the six "built, wired, never fired" instances the queue records.

New `isOutreachModuleReady()` is the gate's own condition, so rail and gate are now one boolean. I made both signals **required** on the input type, so a caller that forgets to wire them fails typecheck — that's the wiring proof, stronger than any assertion, and running it confirmed both production call sites already comply.

Red first: 10 assertions failed before the fix. Two pre-existing tests asserted the defect verbatim and are corrected.

## (b) Build BidlowAI a sequence — **not done, and it's your call**

The production database has exactly one firewall rule — Azure services only. My connection timed out. Proceeding meant **opening a paying client's production database to an external IP, autonomously, overnight**. I stopped. The BidlowAI brief the copy must be written *from* also lives in that same unreachable database. Nothing was sent for any client; the fetched `DATABASE_URL` only ever touched gitignored files and both were deleted.

**(a) is what unblocks (b).** Before it, the screen said "Ready to launch" — nothing would have told you a sequence was missing. It now says **"Build a sequence"**. And creating one in the UI auto-runs `autoPrepareSequenceForLaunch` (approve → enroll → plan step-sends, no send), so it's ~5 minutes through the product's own path — better than the script the item asked for.

## Two corrections to my own numbers

I first quoted **2354 tests / 248 files**; that tree still carried a test file from the other branch. This branch is **2351 / 247**. And three typecheck errors I saw were a stale `.next` cache, not real. Commit, PR body and queue row all corrected.

## CI never ran — so I did not merge

GitHub Actions created **no workflow run** for PR #245: `check-runs` for the head SHA returns `total_count: 0`, after three pushes, a close/reopen, and a six-minute wait. Runners are alive (a scheduled job succeeded at 16:04Z), so this is GitHub-side — consistent with two runs stuck `queued` 50+ minutes and several `startup_failure` entries repo-wide this afternoon.

Lint, typecheck, tests and build are all green **locally on a clean tree** — real evidence, but not the merge-blocking gate. Per the tier rule, **CI is NOT MET**. The queue row is `TODO — (b) only; (a) DONE 16`, because half an item finished is not a finished item.

**Open questions: 1** — Do you want the relay to have write access to the production client database? If yes, say whether the firewall rule should be removed afterwards; I'd still need BidlowAI's brief, or your sign-off on copy I draft blind. If no, (b) is a few minutes for you in the UI.


