# Cycle 7 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: EIGHT-DEAD-MAILBOXES.md.

Started 2026-08-26 09:49:49, took about 44.9 minutes.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: EIGHT-DEAD-MAILBOXES.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 7 - queue item 4

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **The eight dead mailboxes** — see `EIGHT-DEAD-MAILBOXES.md`. Answer the SENDING question first. Six need the client to sign in (blocked, prepare only); two Chevron accounts are deleted and can never reconnect. Make the screen stop saying "Connected" when credentials are dead.

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
  `DONE 7`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Cycle 7 complete. Queue item 4 is `DONE 7`.

## The sending question, answered first

**No — none of the eight could send.** Read-only from the code, no test send.

`executeOutboundSend` calls the *same two token functions* reply sync calls (`execute-one.ts:544` and `:714`). One refresh-token grant serves both jobs, so a grant that fails for sync fails for send. It fails **closed** — no ESP fallback — so nothing would have left from a wrong address; the rows just fail terminally.

**Five of the eight are Train Hugger.** The ramp you're waiting on would have launched, queued, and failed every row for your largest client.

## What shipped (#229, `823dc31`, live)

A shared classifier read by **both** the sync and send paths, so they can't drift:

| failure | status | what staff read |
|---|---|---|
| expired sign-in | `CONNECTION_ERROR` | reconnect this mailbox |
| deleted account | `DISCONNECTED` | **cannot be reconnected** |
| transient 5xx | *unchanged* | nothing |

**The check order was the actual bug.** Entra wraps `AADSTS500341` inside an `invalid_grant` response, so testing `invalid_grant` first told staff to "complete MFA" for two Chevron accounts that no longer exist. Retrying-the-dead stops for free — the batch selects on `CONNECTED`. No schema change, no migration.

## It fired — not just shipped

Given this project's worst defect class, I proved it from outside the app, in the public Actions history:

| run | payload | result |
|---|---|---|
| 09:16 (does the flip) | `processed 35, failed 8` | failure |
| 09:21 (next run) | **`processed 27, failed 0, ok true`** | **success** |

**35 → 27.** Eight mailboxes left the batch, and the workflow went green for the first time. Red was watched first (4 failing tests), and the classifier is tested against the *verbatim* production error strings, not my paraphrase.

Gates: lint 0 errors, typecheck 0 errors, **2221 tests**, CI + E2E green, commit verified by hash on the direct App Service URL.

## Two things I deliberately did not do

- **Nothing was reconnected** — needs the client's own sign-in, your call.
- **Publishing the Google OAuth app is still the only fix for the six.** They expire again in seven days, forever, until it's published. This made the expiry *visible*, not absent.

**One inference, not an observation:** the run history proves all eight left `CONNECTED`, but can't distinguish which landed in which status — the batch excludes both alike. You can settle it in ten seconds: Chevron's two should read "Cannot be reconnected", Train Hugger's five "Connection failed". Expect those clients to now show mailboxes needing attention — that's the screen telling the truth, and it reverses on reconnect.

**Open questions: 2** — (1) do you want the Google OAuth app verification started, and (2) what happens to the two Chevron mailboxes: recreated by the client, or removed from the workspace?

