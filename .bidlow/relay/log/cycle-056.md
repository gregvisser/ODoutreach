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
