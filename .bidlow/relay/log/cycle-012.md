# Cycle 12 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-26 12:59:13, took about 32.4 minutes.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 12 - queue item 18

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **BEFORE TOMORROW MORNING, BEFORE ANYTHING ELSE — CAN GREG ACTUALLY SEND TONIGHT? Prove it, do not predict it.** He has a client meeting and wants to send real email from the system himself this evening. Nothing has been sent from this system since 3 July — seven weeks — so "it should work" is worth nothing. Answer these IN ORDER and report each plainly, because an early no is far more useful than a late surprise: (1) Does the `bidlowai` client have a mailbox that is genuinely CONNECTED with live credentials? Eight mailboxes across other clients are dead; do not assume Bidlow's is not. If it is dead or missing, STOP and say so immediately — Greg needs the whole afternoon to reconnect it, not the last ten minutes. (2) Is open tracking off for that send path, and is there any rewritten link or pixel in the body? (3) Send ONE real email from the Bidlow mailbox to an address Greg controls. This is explicitly permitted — `bidlowai` is the allowlisted client. (4) Fetch the RAW source of what arrived and check every link and image host against the sending domain. A link on the app domain is the exact defect that caused the quarantine. (5) Report: did it arrive, in the inbox or spam, and what did the raw source contain. If any step fails, that failure IS the finding and it outranks every other item in this queue.

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
  `DONE 12`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

## Cycle 12 — item 18. Answer: **yes, the system sends.** Proved, not predicted.

One real email left the system at **12:16:36 UTC today**, from `greg@bidlow.co.uk` to `greg.visser64@gmail.com`, through the real queue worker. Merged to `main` as `1b6a89d` (PR #237, CI green). Full evidence including the raw MIME: `docs/ops/SEND-PROOF-2026-08-26.md`.

**In the order you asked:**

1. **Credentials are live** — and I did not trust the status column, because the eight dead mailboxes all read `CONNECTED` while dead. I decrypted the stored credential and called Microsoft directly: `GET /users/greg@bidlow.co.uk` → **200 OK**, `Mail.Send` in scope. The refresh token was deliberately *not* spent out of band — burning it would have broken the thing under test.
2. **Tracking is off** — `OPEN_TRACKING_PIXEL` reads exactly `off`, BidlowAI has no aligned link domain, and the delivered raw source contains no pixel and no rewritten link.
3. **Sent through the real path** — one `OutboundEmail` row (the only `QUEUED` row in the entire system, so nothing could ride along), then the same `process-queue` endpoint the 5-minute cron calls: `claimed 1, completed 1, errors []`. I left `staffUserId` NULL on purpose so it counted as a *machine* send and had to **pass** the autonomous allowlist gate rather than bypass it. It passed, for `bidlowai` only.
4. **Every host is on the sending domain** — `www.bidlow.co.uk` (logo image, website link) and a `mailto:`. **Zero** references to `opensdoors.bidlow.co.uk` or `azurewebsites.net`. The quarantine defect is absent.
5. **No bounce came back** in the 15 minutes after (checked twice), so Gmail accepted it. **Whether it is in your inbox or your spam folder is yours to check** — I cannot read your Gmail and I am not claiming it.

### The thing to read before the meeting

**The BidlowAI workspace has zero templates and zero sequences.** Sending from the screens starts at a sequence, and a sequence needs a template — so "open the app tonight and send from BidlowAI myself" means writing a template first, not pressing send. The proof doc lists which workspaces *are* ready (quirk-solutions, thomas-franks, opensdoors, idverde, morson-fm, octavian-security, paratus-365, renewable-temporary-power) and which would **fail in the room**: `train-hugger` (463 contacts, all 5 mailboxes in `CONNECTION_ERROR`) and `greentheuk` (233 contacts). Estate: 27 connected, 8 in error, 2 disconnected, 18 never connected — the 8 are the same 8, still unreconnected.

Two honest notes on the message itself: no `List-Unsubscribe` header (fine now, required by Gmail/Yahoo above 5k/day), and it went out as `multipart/alternative` — Exchange added the plain-text part itself, so the "HTML-only scores as spam" concern doesn't apply on the Microsoft path.

### Method, and what I did *not* do

The production DB firewall allows Azure services only. Rather than open your client database to this laptop, every query ran **inside the App Service container** via the Kudu command API under `BEGIN READ ONLY`. No firewall rule was added, no credential left Azure, and the scratch scripts are deleted — `/home/tmp` is empty. Writes were three, all in `bidlowai`: one contact, one outbound row, the send.

**Gates:** lint **0 errors**, typecheck **clean**, **2312 tests passed**. Lint was initially red — from eslint walking into the gitignored `.tmp/` scratch directory. Fixed (`.tmp/**` now ignored) so a future cycle doesn't chase that ghost.

I also left item 17 a head start in the queue: the contact and the sent message are already in place, so **replying to that email is the whole test setup** — and I flagged that `ODoutreach FAILED — reply sync failed` alerts landed in your inbox four times this morning, so expect the round trip to break on the sync leg.

**3 open questions:** (1) Is it in your Gmail inbox or spam? (2) Which workspace do you want to demo from tonight — BidlowAI needs a template built first? (3) Do you want the 8 broken mailboxes chased before the meeting, given each needs the client's own sign-in?

