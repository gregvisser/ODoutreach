# Cycle 56 — row 46: the mailbox error that said "Microsoft" on a Google mailbox

**Outcome: code complete, gates green, PR #303 open and NOT merged — blocked by row 39.**

Relay logs are gitignored on `main`, so everything here that has to survive is
also written into QUEUE.md row 46. This file is the readable version.

## What was actually wrong

Greg connected `alex@trainhugger.com` and Chrome quietly pre-selected his own
`greg.visser64@gmail.com` on Google's consent screen. The guard did its job and
refused — that guard is the only thing standing between a personal Gmail and a
client's outgoing cold email — and then the app took that precise, correct,
actionable refusal and reported it as **"Microsoft sign-in did not finish."**

Wrong provider. Wrong problem. No way forward. He tried five times.

## The two fixes

**The banner never asked which provider it was talking about.** Five of its six
messages had "Microsoft" typed into them, written back when Microsoft was the
only provider Outreach supported. The OAuth result arrives as a URL parameter, so
the fix is not to add a provider parameter — a URL parameter is a guess. Both
callbacks now attach `oauth_mailbox_id` to *every* error redirect, and the page
re-reads that row from the database, scoped to the workspace, for its provider
and address.

**The mismatch now has its own name.** A new typed error carries both addresses
from the guard, through the callback, into the redirect, and out as the message
the write-up asked for word for word:

> You approved as greg.visser64@gmail.com, but this mailbox is
> alex@trainhugger.com. Sign in as alex@trainhugger.com, or ask that person to
> connect their own mailbox.

The guard itself is untouched. Domain-wide delegation is not built — the
write-up marks that as Greg's decision and it stays his.

## Three things the brief did not know

1. **Half that switch was dead.** Four of its seven reason codes —
   `oauth_state_invalid`, `oauth_not_configured`, `missing_params`,
   `invalid_mailbox` — are emitted by nothing in the codebase. Meanwhile three
   codes that really are emitted fell through to the generic default. The brief
   said "five of six messages"; that is true of the branches, but only three of
   them could ever be reached.

2. **The right message already existed and nobody could see it.** The Microsoft
   path has had a both-addresses mismatch message for a long time. It only ever
   reached `lastError`, which renders solely inside the owner-only "Connection
   diagnostics" block — so no ordinary staff member could ever read it. Built,
   wired, correct, invisible. That is the eighth instance of this project's
   signature defect, and the brief was right to tell me to assume a seventh
   existed. It is now one wording serving banner, row and audit alike.

3. **A 15-minute token expiry that nothing reads.** `oauthStateExpiresAt` is
   written on every Connect and never appears in either callback's lookup. Left
   alone deliberately and written up as row 50 — it is a security question, this
   row was a wording question, and burying one inside the other is how findings
   get lost.

## Proving it fires rather than exists

- The message layer is pure, so it can be tested at all — the page is an async
  server component behind auth and Prisma, which is exactly how "Microsoft"
  survived in it. A sweep runs every emitted reason code against a Google row and
  asserts the word "Microsoft" never appears.
- The Google callback test drives the real handler with the **real guard**
  against a stubbed Gmail probe. Not a mock standing in for the thing under test.
- One test takes the handler's actual `Location` header, parses it the way the
  page parses it, and checks the finished sentence. That seam — route emits,
  page reads — is where this project's defects live.
- Watched red first: module absent, then 4/4 route tests red. The end-to-end one
  was written green, so I broke the code on purpose to prove it could fail; it
  went red printing the old-world message.

## Gates

`lint` 0 · `typecheck` 0 · `npm test` 2732 passed / 278 files · `build` exit 0.
Frozen `e2e/mailboxes-table-first.spec.ts` run locally: 4 passed.

Two notes on how those numbers were reached. I first branched off
`feat/privacy-terms-pages` by accident and rebased the single commit onto
`origin/main`, then re-ran every gate on the rebased tree rather than trusting
the earlier run. And `npm test` reports 4 failures in the working tree that are
**not mine** — an uncommitted `.bidlow/GRADES.json` edit left over from cycle 55
(that is row 47). Stashing that one file gives a fully green suite; I left the
file alone and did not commit it.

## Why it is not merged

CI: `verify` **pass**, `E2E (Playwright)` **fail in 1m45s** at
`j5-journey.integration.test.ts:369` with `blocked_plan_classifier`. That is row
39 — the J5 test reads the wall clock and is deterministically red before roughly
08:30 UTC. The run was at 04:19 UTC. The signature now matches across five
branches.

I did not merge red and did not touch the assertion. The PR needs no rebase and
no edit; it needs row 39 fixed and a re-run. Row 39 is now marked as blocking
five PRs. There is a second cost worth naming: the job dies during the
integration step *before* Playwright starts, so no overnight PR is collecting any
browser evidence at all — which is why I ran the frozen mailboxes spec locally.

## Queue defect corrected

Two rows were both numbered **46**: this one, and an open-tracking finding cycle
55 added as "rows 46-47" without noticing 46 was taken. The relay resolves "46"
to whichever it matches first. The mailbox row keeps 46; the other moved to 49,
with a note saying so. The new expiry finding is 50. No duplicates remain and the
queue parser passes.

## A near-miss worth more than the row I was given

While reconciling the working tree I checked the two files I had stashed and
restored — `cycle-054.md` and `cycle-055.md` — before trusting them. Both were
showing as modified, and the modification turned out to be a **generic stub**
overwriting the real log:

> Work happened. Evidence: a git ref moved, so something was committed; the
> working tree changed, so files were edited.

101 lines replacing the 202 that cycle 55 actually wrote. The committed versions
are intact; only the working tree was clobbered. Had I committed what was on disk
without looking, two detailed records would have become "Work happened."

That is the same failure mode `MAILBOX-CONNECT-CAUSE.md` opens by describing —
three destroyed copies, twice from cycles rewriting off a stale read — which is
exactly why that write-up lives outside this repo. Queued as row 51, with the
mechanism marked unknown rather than guessed.

## Where the queue record went, and why not here

I put the QUEUE.md changes on `feat/privacy-terms-pages` (PR #302), not on my own
PR. `main`'s QUEUE.md still stops at row 36; rows 37–51 exist only on that branch,
which cycle 55 already designated as the queue's route to `main`. Committing the
queue on #303 as well would have put the same file on two open PRs and guaranteed
the merge conflict this queue keeps recording. One owner for the file, no
conflict, and the record is durable either way.

## Open questions: 1

Row 39 blocks five PRs and is now the most expensive thing in this queue — it
costs every overnight cycle both its merge and its e2e evidence. Should the next
cycle take row 39 ahead of whatever the watcher picks? That is a sequencing call,
and it is Greg's to make or the watcher's to encode.

---

## The watcher's own record of this cycle

Everything ABOVE this line was written by cycle 56 itself. It was destroyed on
`main` and has been restored here, byte for byte, by cycle 63 from the copy that
survived on the branch `feat/privacy-terms-pages` (blob `72977429`).

**What happened.** `relay-watch.ps1` picked this filename at the start of the
cycle and wrote it at the end with `... | Set-Content -Path $logFile`.
Set-Content truncates. Cycle 56 had already written its own log to that exact
path, so the watcher's final write destroyed it and left the 119-line record
that follows. Cycle 56 is the cycle that FOUND this bug — it caught `cycle-054`
and `cycle-055` being clobbered in its working tree and rescued both, then lost
its own log to the same defect on the way out. Nobody noticed for seven cycles.

The truncation is fixed in `relay-watch.ps1` (`Write-CycleLog`, which appends
and never shortens) and held by `relay/cycle-log-preserved.test.ts`.

The watcher's record is kept below rather than discarded: it is the independent
half — exit code, timing, and an evidence verdict derived from what moved on
disk rather than from what the cycle claims.

# Cycle 56 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-28 04:55:16, took about 34 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\MAILBOX-CONNECT-CAUSE.md, mailboxes/page.tsx, google/callback/route.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 56 - queue item 46

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **GREG ASKED FOR THIS DIRECTLY. THE MAILBOX ERROR SAYS "MICROSOFT" ON GOOGLE MAILBOXES, AND HIDES THE REAL REASON. FULL WRITE-UP: `C:\Bidlowbusiness\_odoutreach-handover\MAILBOX-CONNECT-CAUSE.md` - READ IT FIRST, it is outside this repo because three earlier copies were destroyed in here.** **(a) Wrong provider.** `src/app/(app)/clients/[clientId]/mailboxes/page.tsx` lines 123, 125, 131, 133 and 144 hardcode "Microsoft" into five of six messages. Written when Microsoft was the only provider, never revisited when Google was added. The mailbox row knows its provider; the banner never asks. Take the provider from the row and name it correctly - and note the OAuth result is a URL parameter, so the provider must come from the mailbox being connected, not from a guess. **(b) The real cause is swallowed.** CONFIRMED 2026-08-28: Greg approved as `greg.visser64@gmail.com` while connecting `alex@trainhugger.com` - Chrome pre-selected his own account. `verifyGoogleMailboxOAuthForWorkspaceRow` (google/callback/route.ts:99-103) correctly refused the mismatch and threw; the catch-all at :188 flattened it to `callback_failed`. THE GUARD IS RIGHT AND STAYS - without it his personal Gmail becomes a client's sending address. Give the mismatch its own reason code and write this message, NAMING BOTH ADDRESSES: "You approved as <signed-in address>, but this mailbox is <row address>. Sign in as <row address>, or ask that person to connect their own mailbox." A mismatch message that does not print both addresses is half a message. Red-first: assert a Google mailbox never yields the word Microsoft, and that a wrong-account approval yields a distinct reason carrying both addresses. NOTE: domain-wide delegation is NOT needed - OpensDoors operations hold these accounts on their authenticators and can sign in as each mailbox. Do not build it.

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
  `DONE 56`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

## Cycle 56 — row 46

**Code complete, gates green, PR [#303](https://github.com/gregvisser/ODoutreach/pull/303) open and not merged.**

### What was wrong
Greg connected `alex@trainhugger.com` while Chrome had pre-selected his own `greg.visser64@gmail.com`. The guard refused correctly — it's the only thing between a personal Gmail and a client's outgoing cold email — and the app reported that as **"Microsoft sign-in did not finish."** Wrong provider, wrong problem, no way forward.

### The fix
**(a)** Both callbacks now put `oauth_mailbox_id` on *every* error redirect, and the page re-reads that row for its provider. The provider is a database read, never a URL parameter. All wording moved into a pure module — the page is an async server component behind auth and Prisma, which is precisely how "Microsoft" survived in it.

**(b)** A new typed error carries both addresses from the guard through to its own reason code, rendering the mandated wording verbatim. The guard is unchanged; domain-wide delegation not built.

### Three things the brief didn't know
1. **Four of that switch's seven reason codes were unreachable** — nothing emits them — while three that *are* emitted fell to the default.
2. **A correct both-addresses message already existed** on the Microsoft path, but only ever reached `lastError`, which renders solely inside the owner-only diagnostics block. Built, wired, correct, invisible — instance eight.
3. `oauthStateExpiresAt` is written on every Connect and **never read** by either callback. Left alone deliberately, queued as row 50.

### Proof it fires
Every emitted reason swept for the word "Microsoft" on a Google row; the real handler driven with the **real guard** (not mocked) against a stubbed Gmail probe; and one test carries the handler's actual `Location` header through the page's own parser to the finished sentence. Watched red first, then proven capable of failing by restoring the old reason code.

`lint` 0 · `typecheck` 0 · **2732 tests** · `build` exit 0 · frozen mailboxes e2e 4 passed locally.

### Why it isn't merged
CI `verify` **passed**; `E2E (Playwright)` **failed** on `j5-journey.integration.test.ts:369` — that's **row 39**, the clock-dependent failure that is deterministic before ~08:30 UTC. Run was 04:19 UTC; identical signature on a fifth branch now. I didn't merge red and didn't touch the assertion. The PR needs no rebase — it needs row 39 fixed and a re-run.

### Two things I corrected rather than worked around
- **Two rows were both numbered 46.** Cycle 55 added findings as "46–47" without noticing 46 was taken. Mailbox row keeps 46; the other moved to 49.
- **A near-miss:** the "uncommitted edits" to cycle 54's and 55's logs were **generic stubs** ("Work happened.") overwriting the real records. Caught by diffing before trusting; one commit from destroying them. Queued as row 51 with the mechanism marked unknown, not guessed.

Queue record committed to `feat/privacy-terms-pages` (#302), not #303 — `main`'s QUEUE.md stops at row 36 and that branch is already the queue's route there; duplicating it would have guaranteed a conflict.

**Open questions: 1** — row 39 now blocks five PRs and costs every overnight cycle both its merge and its e2e evidence. Should the next cycle take row 39 ahead of whatever the watcher picks? That's a sequencing call, and it's yours or the watcher's to make.

