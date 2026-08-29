# Cycle 93 — queue row 81

**The do-not-contact sync now remembers which tab it read.** Shipped as
`111a298` (PR #370), merged to `main` on green CI and deployed.

## PR sweep at cycle start

`gh pr list --state open` returned `[]`. Nothing to merge, nothing abandoned.
The landfill is empty for the first time in this stretch.

## What the row asked for, and what was actually true

Row 81 said five of thirty-four blocklists fail every run with
`Quota exceeded`, and that "~29 of the 34 sources have no saved
`sheetRange`".

**Both halves needed correcting, in opposite directions.**

Measured before touching anything, via `dnc-sheet-inventory` (database only,
no Google call, cannot itself exceed a quota), run 33241655685:

* **The quota failures are STALE.** The 2026-08-28 19:07–19:08 production run
  shows **33 of 34 SUCCESS and zero quota errors**, the whole sweep finishing
  in 89 seconds. The read limiter built after cycle 66
  (`sheets-read-limiter.ts`) already fixed the outage this row was written
  about — it paces reads 1.1s apart and retries a refusal twice. The row's
  own "second option is a small concurrency/backoff limit" was taken by a
  later cycle and never written back here.
* **The one ERROR is not quota.** Train Hugger — Whole domains, stuck since
  2026-08-14, `lastError` = the shrink guard refusing to remove 82 of 373
  blocked domains. That is the guard working, not a failure.
* **The arithmetic is WORSE than the row thought.** Not ~29 of 34 —
  **34 of 34** sources have `rangeSaved: false`. Every one of them. So each
  15-minute cron pays 68 Google reads to re-derive 34 answers that have not
  changed.

So this was not an outage fix. It halves a standing cost currently absorbed
by ~45 seconds of deliberate sleeping per run, and it closes a real hazard
the row identified correctly.

## What shipped

**1. The resolved range is remembered.** Once Google has served a range, it
is saved to the source. A sweep over N sources issues 2N reads the first
time and **N** thereafter.

The row flagged this as "a WRITE to client config, so decide deliberately".
The decision, and the four conditions that make it narrow:

* only when the operator left the range blank — an explicit range is theirs
  and is never overwritten
* only when the tab names were **genuinely read**, never from a guess
* only after Google served that exact range
* never on a dry run

It is reversible without a deploy: clearing the box in the UI restores
today's resolve-every-time behaviour. That reversibility is what made this
mine to decide rather than Greg's — it is not a one-way door, it moves no
client data, and it sends nothing.

It is also remembered when the **shrink guard refuses**. The refusal is
about how many rows the sheet holds, not which tab they are on, and Google
already served that range. Without this, Train Hugger's domain list would
re-resolve its tab every fifteen minutes for ever while parked in refusal.

**2. The sync refuses instead of guessing.** This is the sharper half.
`readSheetTabTitles` swallowed its errors and returned `[]`, which was
indistinguishable from "this sheet has no tabs" and fell back to
`Sheet1!A1:Z50000` — on a path that **DELETES before it inserts**. A metadata
call refused for quota could therefore aim a REPLACE at a tab nobody chose
and silently unblock a client's whole do-not-contact list. The lookup now
reports its failure and the sync refuses.

Cost of refusing: one missed 15-minute cycle. Cost of guessing: a blocklist
replaced from the wrong tab. This also reversed a documented earlier
decision — `sheet-range.ts` argued the fallback "leaves behaviour exactly as
it was rather than inventing a range". That reasoning missed what the caller
does next; the reversal is recorded inline at both changed tests.

The two halves compose: a range from a guess can never be persisted, which
is precisely what makes (1) safe.

## Red-first

`suppression-sync-range-persistence.test.ts` drives the **real**
`syncAllConfiguredSuppressionSources` over a mutable store that the sync
writes back into, twice, and counts the Google calls. Staging a "second
run" with pre-saved rows would have proved nothing about whether the first
run saved anything — the feedback IS the behaviour under test.

Against the old code: **7 of 11 failed.** The 4 that passed are the ones
pinning behaviour that must NOT change (operator range respected, dry run
writes nothing, first-sweep read count). Green after. That split is the
useful signal — it isolates the new behaviour from the preserved behaviour.

Two existing tests asserting the `Sheet1` fallback were rewritten to assert
the refusal.

## Gates — all run, all shown

* `npm run lint` — clean, 0
* `npm run typecheck` — clean, 0
* `npm test` — **3589 passed in 345 files**
* `npm run build` — green
* CI on PR #370: `verify` pass 4m45s, `E2E (Playwright)` pass 5m33s

No schema change, no migration, no client data moved, **no email sent**.
None of the three stop-and-ask conditions was touched.

## Proven to FIRE, not merely to exist

The queue's standing warning is six things built, wired, reporting success
and never firing. The guard here is that the new suite drives the real
sync-all through a real store: unwire the persist and the second-sweep read
count goes straight back to 2N and the suite goes red. It cannot pass while
the feature is inert.

Verified live after deploy — see below.

## What was deliberately NOT done

* **The quota was not raised.** The row forbade it, and the measurement says
  it is unnecessary.
* **No new column.** I designed and then rejected a
  `sheetRangeAutoResolvedAt` column plus auto-healing (clear the range on a
  range-invalid error and re-resolve). Auto-heal would mean a client renaming
  a tab causes the app to **silently re-point their blocklist at a different
  tab** and REPLACE from it. A loud error plus a human decision is correct for
  opt-out data. Dropping the auto-heal removed the only reason for the column.
* **`rangeSaved` in the inventory** now means "a range is stored", not "an
  operator typed one". Corrected in the doc comment rather than papered over —
  the repair is the same either way (clear the box).

## Open question for Greg — 1

**Train Hugger's domain blocklist has been stuck since 2026-08-14** in a
refused shrink: the sheet would remove 82 of 373 blocked domains, and the
guard is holding all 373. That is fifteen days of a list not updating. It
needs a human to decide whether the removal was deliberate (confirm it) or a
mistake in the sheet (put the rows back). Nothing in this cycle changes it,
and no agent may decide it — unblocking 82 domains on a live cold-email
system is a client-data call.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 93 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 08:46:08, took about 27.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 93 - queue item 81

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **CYCLE 65'S TAB FIX PUSHED THE DO-NOT-CONTACT SYNC OVER GOOGLE'S READ QUOTA, AND 5 OF 34 BLOCKLISTS NOW FAIL EVERY SINGLE RUN.** Measured by cycle 66, twice, against production: every run returns `failedCount: 5` with `Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user' of service 'sheets.googleapis.com'`. A DIFFERENT five each time, so no client is permanently broken and none is reliably working either. **The cause is arithmetic, not a bug.** Resolving the real tab costs a `spreadsheets.get` per source, and ~29 of the 34 sources have no saved `sheetRange`, so a run went from ~34 reads to ~63 against a 60-per-minute quota. This hits the REAL 15-minute cron, not just the dry run - they issue identical reads. **Why this matters more than a quota warning:** a blocklist that silently stops updating is the exact failure row 48 exists to fix, and this reintroduces it for a rotating 15% of clients. Worse, when the metadata call is the one that gets refused, `readSheetTabTitles` swallows it and returns `[]`, which falls back to `Sheet1!A1:Z50000` - so a quota blip can silently aim a REPLACE at the wrong tab. The shrink guard catches the large ones; it is a backstop, not a reason to leave this. **DO NOT fix by raising the quota first - measure which sources actually need the metadata call.** The cheap fix is to stop making it: persist the resolved range to `sheetRange` after a successful read, so each sheet pays the lookup once instead of every 15 minutes for ever. Watch that that is a WRITE to client config, so decide deliberately. Second option is a small concurrency/backoff limit in `syncAllConfiguredSuppressionSources`, which is safer but leaves the reads. Red-first: a sync-all run over N sources issues at most N reads when every range is known. *(Cycle 71: this row was numbered 69 in the second, header-less table that used to sit at the bottom of this file. Merging the tables gave it 81 so it would stop sharing a number with a different job.)*

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## FIRST, BEFORE ANY NEW WORK: CLEAR THE GREEN PULL REQUESTS

Do this at the START of every cycle, before you read the item below. It takes two
minutes and it is the difference between a queue and a landfill.

`gh pr list --state open` then, for every PR whose checks are GREEN: bring the
branch up to date if branch protection requires it, and MERGE it. Greg counted
SEVENTEEN open on 2026-08-28 and most were green - they had simply been opened and
abandoned.

**Understand WHY this happens, because it is structural and not laziness.** A
cycle finishes its work, opens a PR, and ends. CI takes about five minutes. Nobody
ever comes back. So every cycle adds one and removes none, for ever. The only
place that can be fixed is here, at the start of the NEXT cycle.

Rules for the sweep:
* RED PRs are not yours to force. Read the failure, and either fix it as part of
  this cycle or say in your log why you left it.
* Merge order matters: branch protection requires each branch to be current, so
  every merge invalidates the next one. Take the docs and `.bidlow` record PRs
  first - they cannot conflict with code - then the code ones, updating as you go.
* `gh pr merge --auto` is better than update-then-race if auto-merge is allowed.
* A DESTRUCTIVE migration is still Greg's. Additive is yours.
* If a PR is genuinely not ready, say so in a comment on it, so the next cycle
  does not have to work that out again.

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
  `DONE 93`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 93 - ...** |` reads correctly.
Anything else does not. The relay reads QUEUE.md with a regex, and a status it
cannot read STOPS THE WHOLE QUEUE, on purpose: refusing to guess is the right
behaviour, and inventing is the one thing this relay will never do.

This is not hypothetical, and it is not pedantry. Cycle 59 built, merged and
DEPLOYED half of row 40 - good work, verified by commit hash - and then wrote its
status as `PARTLY DONE 59`. Two words, one of them not on the list above. The
row stopped parsing, the picker met it first, and the relay took nothing at all
for seventy minutes while eleven jobs waited behind it. `SUPERSEDED` did exactly
the same thing to row 38 the day before.

So, plainly:

* Finished it -> `DONE 93 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 93 - <what is done, what is left>`. PARTIAL
  is TAKEN by the relay, so the next cycle picks the row straight back up. This is
  the right answer whenever you shipped part of a row.
* Could not start -> `TODO - <why>`
* Never invent a seventh word.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Both PRs merged, zero left open. Cycle 93 complete.

## What shipped

**Row 81 — the do-not-contact sync now remembers which tab it read.** Code in `111a298` (PR #370), records in PR #371. Both merged on green CI, deployed, and verified live.

## Two corrections to the brief, measured before I touched anything

I ran `dnc-sheet-inventory` first — database-only, no Google call, so it cannot itself burn the quota.

- **The quota failures the row describes are stale.** The 2026-08-28 production run shows **33 of 34 SUCCESS and zero quota errors**, the whole sweep in 89 seconds. `sheets-read-limiter.ts` — the row's own "second option", taken by a later cycle and never written back — already fixed that outage. The single ERROR is Train Hugger, and it is the *shrink guard* refusing, not quota.
- **The arithmetic is worse than the row thought:** not "~29 of the 34" but **34 of 34** sources had no saved range. Every 15-minute cron paid 68 Google reads to re-derive 34 answers that hadn't changed.

So this wasn't an outage fix. It halves a standing cost and closes a real hazard the row identified correctly.

## The change

The resolved range is now saved once Google has served it: a sweep over N sources issues 2N reads the first time and **N** thereafter — the measure the row asked for. The write to client config is narrow by design (never overwrites an operator's range, never from a guess, never on a dry run) and an operator can undo it by clearing the box, no deploy needed. That reversibility is why I treated it as mine to decide rather than yours.

The sharper half: `readSheetTabTitles` swallowed its errors and returned `[]`, indistinguishable from "no tabs", falling back to `Sheet1!A1:Z50000` — on a path that **deletes before it inserts**. A quota blip could aim a REPLACE at a tab nobody chose. It now refuses. One missed 15-minute cycle beats a blocklist rebuilt from the wrong tab.

## Proof it fires

Red-first: 7 of 11 failed against the old code; the 4 that passed pin behaviour that must *not* change. Then, live in production, I synced **BidlowAI's own** sheet — the one client the hard rule permits — and exactly one source flipped to `rangeSaved: true` at 08:11:21 UTC. The other 33 are untouched.

Gates: lint 0, typecheck 0, 3589 tests in 345 files, build green, CI verify + E2E pass on both PRs. Build-info on the direct App Service URL confirms `111a298`. No schema, no migration, no email.

## Two things for you

1. **Train Hugger's domain blocklist has been stuck 15 days** in a refused shrink — the sheet would drop 82 of 373 blocked domains and the guard is holding all 373. Someone has to decide whether that removal was deliberate or a sheet mistake. Unblocking 82 domains on a live cold-email system isn't an agent's call.

2. **Found while verifying, not looked for:** the replies cron last ran 2026-08-28 19:06 — 13 hours ago, mid-working-day — and its last four runs all concluded `failure`. The DNC sync rides on that cron, so the schedule it depends on is not keeping time. I did not chase it; it's a separate concern from row 81 and belongs in the queue.

**Open questions: 2.**

