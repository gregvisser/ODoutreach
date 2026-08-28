# Cycle 9 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-26 11:15:52, took about 46.6 minutes.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 9 - queue item 6

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **DESIGN.json** — third PLAN artefact. Direction, tokens, signature elements, anti-goals, WCAG 2.2 AA. Propose a direction; do not wait to be told one. Greg has asked three times that systems stop looking generic.

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
  `DONE 9`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Cycle 9 done. Item 6 is `DONE 9`, merged, deployed and verified live.

## What I did

**The direction — "Ledger & Rail."** An outreach console is a record of things that have left the building and cannot be recalled, so it should read like a well-kept ledger, and anything capable of leaving the building should be visibly marked as such. `.bidlow/DESIGN.json` carries the direction, both themes' tokens, typography/elevation/motion rules, six signature elements, ten anti-goals, and WCAG 2.2 AA with all eleven criteria named — including the four genuinely new in 2.2. Plain-English companion at `docs/DESIGN.md`.

**I made it a gate, not a document.** A design artefact nobody enforces is this project's worst defect class in its easiest form. `design-system.test.ts` reads DESIGN.json *and* the real stylesheet and fails on drift either way, on any contrast pair below AA, on a violet hue, on pure black on white, or on a sub-24px button. Contrast is computed through a full OKLCH→sRGB conversion, because OKLCH lightness is not WCAG luminance — checked against two independent known answers (black/white = exactly 21:1; #ff0000 recovers 0.21260, the WCAG red coefficient by definition).

## It fired, on real ground

Written before any fix, it went red on **five WCAG 2.2 AA failures already live in production**. The serious one: `--input` at **1.21:1** against a required 3:1 — and it is the *sole* identifier of every text field, textarea and select trigger, all `bg-transparent`. Form fields were near-invisible until clicked. One token fixed all 34 call sites across 15 files. `--destructive` text was at 4.44:1 against 4.5.

Then I broke all five arms deliberately. **That found a real defect in my own gate**: the violet and pure-black checks read DESIGN.json rather than the stylesheet — they compared the document against itself and could never have caught a violet in the shipped CSS. Fixed and re-proven. That is the **ninth** instance of "wired but never fires", inside the gate written to prevent the ninth. Recorded as a standing finding with the generalisable lesson.

## What I deliberately did not do

**The two signature elements that actually stop it looking generic — the send rail and live/dry banding — are specified, not built.** Nothing looks different today except the two colour fixes. Both are blocked behind item 7, which moves the surfaces they attach to. Please don't read this as a redesign.

Three further real defects left measured rather than rushed: the destructive **button** still fails at 3.72:1 (needs a solid-red variant — a component change), two chart series at 2.51/2.39 (the naive fix collides chart-4 with chart-1), and inherited in-flow shadows.

## Proof it reached users

Merged `fd97441`, deployed, `/api/build-info` on the **direct** App Service URL returns `fd97441b64a4...`, and the served stylesheet carries `--input:oklch(62% .013 165)` and `--destructive:oklch(55% .245 27.325)` with zero occurrences of the old values.

I merged this without asking. It has no schema change, no migration, nothing destructive, no send path and no client data — none of the things your working agreement gates on — and holding it would have left a measured accessibility failure in front of users. Cycle 8 held because that one ran DDL on a live client database; this one doesn't.

Gates: lint 0 errors, typecheck clean, 2299 tests green (+74), build compiled, both CI checks green. PR #233 corrected two inaccuracies in my own records (I'd quoted 2334 tests, a figure from the other branch).

**Open questions: 2**

1. The send rail and live/dry banding are blocked behind PR #196 (item 7). Do you want that unblocked next? It's the difference between a recorded direction and a product that looks like it.
2. Should the delete button become solid red with white text? It fixes a real AA failure on a control that destroys things, but it changes every delete button in the product.

