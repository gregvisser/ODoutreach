# Cycle 165 - row 128

## Merge

PR #467, CI green (verify + E2E Playwright both passed), squash-merged to
`origin/main` as `c88702c3321c932b0a0a1d598ba95f78b693475a`, confirmed via
`git ls-remote origin refs/heads/main`. This QUEUE.md hash line is a small
follow-up commit on top of that merge, the same pattern earlier rows (e.g.
151) used, since the hash cannot be known until after the merge it describes.

## PR sweep

`gh pr list --state open` returned zero open PRs. Nothing to merge or chase.

## Precondition check (by script, not by eye), before any scoring

Row 128's own rule: start only once every row above it reads `DONE`,
`BLOCKED` or `WONTFIX`. Read every status cell for rows 1-127 directly off
`.bidlow/relay/QUEUE.md` (not from memory or from the brief's own summary).
One row failed: **row 125 read `IN PROGRESS 159`.**

Investigated rather than worked around, per the standing "if it is wrong, say
so and correct QUEUE.md" instruction, and per this repo's own `CLAUDE.md`
guidance on a row reopened after a timeout possibly already being finished.
Cycle 159's own log said: "The merge (`11604ed`) is confirmed on
`origin/main`, gates are green, and the investigation from cycle 158 is
solid. I'm now waiting on a background poll for the first scheduled
`sync-replies.yml` run... I'll report back once it lands." That "report back"
never happened and structurally never could — a relay cycle is one-shot; the
process that said it would report back had already ended. Checked whether
the missing proof now exists: `gh run list --workflow=sync-replies.yml`
showed run `33336908935`, `event: schedule`, started
`2026-08-30T21:36:50Z` — a Sunday, outside the old business-hours cron by
every measure. That is exactly the proof row 125's own definition of done
asked for. It failed overall, but only on an unrelated step (a different
client's DNC sheet sync hitting a Google 502, confirmed by reading
`gh run view 33336908935 --log-failed`, not the badge). So row 125 was
functionally complete and only ever missing a status update — no new
engineering, pure verification against its own already-written definition of
done. Closed it `DONE 165` in this same change, and filled the one
placeholder line `docs/ops/REPLY-SYNC-ALWAYS-ON-2026-08-30.md` had been
left with, with this evidence.

Rows 126 and 127 already read `DONE`. With row 125 corrected, the
precondition was met and this row's actual work could proceed.

## The work

`docs/ops/DIMENSION-1-RESCORE-2026-08-30-cycle165.md` is the full record:
evidence, both required caveats, the arithmetic, and the plain sell-gate
answer. Summary: dimension 1 (Core journeys end-to-end, weight 18) moved
8 -> 9 on the strength of `docs/ops/SEND-PROOF-2026-08-30.md` +
`docs/ops/REPLY-PROOF-2026-08-30-cycle156-row123.md` — a real, human-typed
reply landing and correctly matching the right send and the right sequence,
with follow-ups actually stopping, plus Greg personally reading that
artefact, watching the live screens, and saying in Cowork "I am satisfied
yes." That is the exact, named condition every prior scoring pass on this
dimension held it at 8 for. Weighted customer-ready total: 7.96 -> 8.14.
Sell gate (Engineering >= 8 AND Customer-Ready >= 8): **SATISFIED, yes** —
Engineering held at 8.5 (not re-measured, per this row's own instruction not
to re-walk the 32 screens or re-run the full suite), Customer-Ready 8.14.

Both caveats the brief required are in the artefact and in the
`.bidlow/GRADES.json` entries, not just in this log: (1) the match fired on
the fallback leg (subject-anchored), not the definitive Message-ID leg,
which cannot fire on Microsoft Graph sends at all as the matcher stands
today, and Graph is currently the only provider carrying real traffic; row
110 is the parked fix. (2) row 113/126's Anthropic HTTP-400 finding, which
the brief said to weigh, is now itself stale — fixed in cycles 160-162
(`docs/ops/AI-FEATURES-REVERIFY-2026-08-30-cycle160.md`) — but it never
applied to this dimension regardless, since the core send/reply/opt-out
mechanism does not call any AI feature; checked directly against the code
rather than assumed.

The number was not decided first. If the reply had matched the wrong thread,
or Greg had not confirmed it, or the core mechanism had turned out to depend
on the now-fixed (at the time, broken) Anthropic path, this would still read
8 and this log would say so.

## Files changed

`.bidlow/GRADES.json` (dimension 1 score/observed text, arithmetic,
`weighted_total`, `sell_gate` block, `movement_this_regrade`, `customer_ready.score`/`band`),
`docs/ops/DIMENSION-1-RESCORE-2026-08-30-cycle165.md` (new),
`docs/ops/REPLY-SYNC-ALWAYS-ON-2026-08-30.md` (filled in the one placeholder
line, row 125's own artefact), `.bidlow/relay/QUEUE.md` (rows 125 and 128
status cells). No application code touched.

## Gates

`npm run lint` -> 0 problems. `npm run typecheck` -> 0 errors.
`npm test` -> 362 files / 3772 tests, all green (no application code changed,
run anyway per the standing per-cycle rule). JSON validated with
`node -e "JSON.parse(...)"` after every edit to `.bidlow/GRADES.json`.

## What I did not do

Did not re-walk the 32 screens or re-run the full Playwright screen-walk
suite, per the row's explicit instruction — `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`
is untouched. Did not touch dimension 8 even though the now-fixed Anthropic
key changes the shape of CR-10's "inert but real" risk (the pathway is no
longer inert) — that is a real observation but out of scope for this row,
which names dimension 1 only; noted in the artefact as a finding for
whoever next revisits dimension 8, not acted on here. Did not send any
email, did not touch client data, did not run a migration.

## Scope note on row 125

Closing row 125 was not this row's assignment, but leaving it `IN PROGRESS`
would have permanently blocked this row and every row after it that checks
the same precondition by script — `IN PROGRESS` is not a status the relay
picks back up the way `PARTIAL` is, so nothing would ever have revisited it
on its own. The closure was pure verification against row 125's own,
already-written definition of done, not new engineering, and is recorded
here and in row 125's own status line rather than folded silently into row
128's log.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 165 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: B9E192203DEB
  On disk now:      51AF85ED01BF

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-30 22:49:15, took about 26.6 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: docs/ops/REPLY-PROOF-2026-08-30-cycle156-row123.md, docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md, docs/ops/AI-FEATURES-FIRE-VERIFICATION-2026-08-30-cycle157.md, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 165 - queue item 128

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE DIMENSION 1 RE-MEASURE. GREG HAS NOW WATCHED THE REPLY LAND AND CONFIRMED IT. RUNS LAST.** On 30 August, having read `docs/ops/REPLY-PROOF-2026-08-30-cycle156-row123.md` and looked at the live screens himself, he said in Cowork: I am satisfied yes. That human observation is the thing the scorecard has always required and never had. Dimension 1 - Core journeys end-to-end, weight 18 - has been held at 8 since 27 August solely because nobody had watched a reply land against the RIGHT send. That condition is now met. **PRECONDITION, BY SCRIPT NOT BY EYE:** start only once every row above this one is closed - DONE, BLOCKED or WONTFIX. If any is still TODO, PARTIAL or IN PROGRESS, leave this row TODO, name the open row, and do not measure a moving target. **THE WORK:** re-score dimension 1 on the evidence that now exists, recompute the weighted customer-ready total and the sell gate, and write a dated artefact under `docs/ops/`. **DO NOT RE-WALK THE 32 SCREENS OR RE-RUN THE FULL SUITE** - `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md` did that today against commit `2c1e04f` and every other dimension holds. This row moves ONE dimension and redoes the arithmetic. **THE GATE IS NOT A TARGET, AND THIS IS THE MOST IMPORTANT SENTENCE IN THIS ROW.** The previous total was 7.96 against a bar of 8.0, short by 0.04, so almost any upward nudge crosses the line. **That is precisely why the score must be argued from evidence and never reverse-engineered from the bar.** Do not decide the number first. If the honest score is 9, say why and let the arithmetic land where it lands. If the honest score is still 8, say that and leave the gate closed - a gate that opens because someone wanted it open is worth nothing. **THE CAVEAT THAT MUST APPEAR IN THE ARTEFACT, stated and not buried:** the loop is proven, but it matched on the FALLBACK path. Leg 1, the definitive thread-reference match, did NOT fire and structurally could not have - that send went via Microsoft Graph, which never stamps `rfc822MessageId` (row 105 measured 0 of 267), and row 108's read-back fix only covers Gmail. What matched was leg 2, subject-anchored on contact email, which depends on the prospect leaving the subject line intact. Row 110 is the parked fix for the Graph half. Weigh that honestly rather than treating the journey as unconditionally proven. **ALSO WEIGH, because it is new since the last measurement and it cuts the other way:** row 113 / cycle 157 found that no real Anthropic call currently succeeds - the key is identity-linked and the code does not send the required `anthropic-workspace-id` header, so every AI feature that reaches a live call fails HTTP 400 (`docs/ops/AI-FEATURES-FIRE-VERIFICATION-2026-08-30-cycle157.md`, raised as row 126). If any dimension was scored on the assumption those features work, that assumption is now false and the score must reflect it. **DO NOT** edit `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md` - it is today's record and stands; supersede it with a new dated artefact rather than editing history. **NO SEND.** **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** `.bidlow/GRADES.json` carrying the re-scored dimension with its reasoning and arithmetic, a dated artefact under `docs/ops/` naming the evidence and both caveats, a plain one-line answer to 'is the sell gate satisfied, yes or no', lint 0, typecheck 0, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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

## THIS PROJECT'S FOLDER, AND NOTHING OUTSIDE IT

You are working on ONE client system. Greg runs several side by side, and they
share one folder deliberately: `C:\Bidlowprojects\_standards` is the METHOD -
the hooks, the gates, the skills, the deck, the checklists - and it applies to
every project at once.

**Do not create, edit, move or delete anything under `_standards` unless the
queue row you are working on names that path explicitly.** A change made there
while doing client work does not stay with this client; it silently changes how
every other build is judged, including ones nobody is looking at today. If this
row's work seems to need a change to the method, STOP and write the case for it
into your log as a finding. Somebody will queue it as its own row, against the
standard, where it can be reviewed on its own terms.

The same goes for any sibling project folder - `BidlowClients\Kepak`,
`BidlowClients\Papaya`, `BidlowTools\*`. Read them if a row asks you to
compare something. Never write to them.

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
  `DONE 165`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 165 - ...** |` reads correctly.
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

* Finished it -> `DONE 165 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 165 - <what is done, what is left>`. PARTIAL
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

Row 128 is complete and merged. Summary:

**Precondition check found a real blocker, resolved it, then did the work:**
- Row 125 was stuck `IN PROGRESS 159` — the cycle that did the work ended while waiting on an async proof it could never come back to report. Verified the proof now exists (a real `sync-replies.yml` run Sunday 21:36 UTC, outside business hours) and closed it `DONE 165`, unblocking the precondition.
- **Dimension 1 re-scored 8 → 9**: Greg's own confirmed observation (a real, human-typed reply landed and correctly matched the right send/sequence, follow-ups stopped, and Greg watched it live and said "I am satisfied yes") was exactly the condition every prior scoring pass named as missing.
- Both required caveats recorded: the match fired on the fallback (subject-anchored) leg, not the definitive Message-ID leg, which structurally can't fire on Graph sends; and the Anthropic HTTP-400 issue cited in the brief is now stale (fixed in later cycles) but was never relevant to this dimension anyway.
- Weighted customer-ready total: 7.96 → 8.14. **Sell gate: SATISFIED — yes**, for the first time since this scoring method began.

Merged to `main`: `c88702c` (PR #467, the rescore) and `f447fdc` (PR #468, recording the merge hash), both confirmed on `origin/main` via `git ls-remote`. Lint 0, typecheck 0, full suite 362/362 files green throughout.

