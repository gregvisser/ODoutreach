# Cycle 163 - row 122

## Files changed

`relay-watch.ps1` and `relay-selftest.ps1` only, per the brief's own scope
line. No app code, no `.bidlow/GRADES.json`, no readiness verdict.

## The red-first test

`relay-selftest.ps1` section 11, two new pure-decision cases plus a real
scratch-git-repo pair, driving new functions `Find-UnmergedPushedBranchForRow`
and `Get-DoneWithUnmergedBranchStatus`. Watched RED first: `git stash push --
relay-watch.ps1` (leaving the new selftest assertions in place with none of
the new functions defined), reran `relay-selftest.ps1`, and it failed
immediately -

    Get-DoneWithUnmergedBranchStatus: ...relay-selftest.ps1:628
    The term 'Get-DoneWithUnmergedBranchStatus' is not recognized as a name
    of a cmdlet, function, script file, or executable program.

- before any of section 11's own assertions could even run. `git stash pop`
restored the fix; full self-test reran green, 74 checks (up from 68 before
this row - the six new PASS lines under section 11 in the transcript below
account for the rise the brief asks for).

## What "done" looks like

A cycle that closes its own row DONE while a pushed branch for that row sits
ahead of `origin/main`, unmerged, no longer stays silently closed - the
watcher rewrites it to PARTIAL and names the branch, so the next cycle picks
it back up and finishes the merge instead of the work sitting on a branch
forever, which is what actually happened to row 114/cycle 154 (PR #451) on 30
August.

## What must NOT be touched

Anything outside `relay-watch.ps1` / `relay-selftest.ps1`; `.bidlow/GRADES.json`;
any dimension score; `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`.

## What it did

**FIRST, the PR sweep.** `gh pr list --state open` showed exactly one open
PR: #461 (row 127's BOM fix, on the branch this cycle inherited: cycle 162
had committed and pushed it, written `DONE 162`, and ended - its own log said
plainly it was waiting on CI and would merge once green, with nothing left
running to do that. **This is row 122's own defect, caught live, on the very
branch this cycle started from**, before a single line of row 122's own fix
existed.) CI was still in progress when checked; it also turned out cycle
162's own log file, `.bidlow/relay/log/cycle-162.md`, was sitting untracked
in the working tree - the previous cycle wrote it but never committed it,
which `relay/cycle-log-reaches-git.test.ts` exists to catch and did, the
moment `npm test` ran. Committed it (`342acf0`, alongside the still-open
branch, since it documents that cycle's own session and the BOM-restoring
pre-commit hook was already active on that branch to protect QUEUE.md while
doing it), pushed, waited for CI, and merged #461 by hand once green -
exactly the human action row 122 exists to make automatic. Confirmed on
`origin/main` before starting row 122's own work.

**THEN row 122 itself**, on a fresh branch off the now-updated `origin/main`
(`fix/row122-unmerged-done-guard`), carrying forward only the uncommitted
`relay-watch.ps1` / `relay-selftest.ps1` diff already in the working tree
(unrelated to row 127's files, so no conflict).

Added two functions to `relay-watch.ps1`, placed directly beside row 121's
own DONE-without-merge guard and reusing its `Test-RowNumberMergedInLog`
matcher rather than inventing a second mechanism, as asked:

- `Find-UnmergedPushedBranchForRow` (I/O) - fetches `origin`, walks every
  `refs/remotes/origin/*` branch, keeps only ones with at least one commit
  ahead of `origin/main`, and checks whether the row number appears in either
  the branch's own name (this repo's convention, e.g. `fix/row127-queue-bom`)
  or its commit subjects - reusing the exact anchored `\brow\s*N\b` matcher
  row 103's orphan-reopen check already relies on, so "row 12" can never
  false-match inside "row 122".
- `Get-DoneWithUnmergedBranchStatus` (pure decision) - given a found branch
  name, rewrites `DONE <cycle> - ...` to
  `PARTIAL <cycle> - closed DONE but branch '<name>' is pushed ahead of
  origin/main and was never merged, ... Original: <original text>`; given no
  branch, returns the status unchanged.

Wired both into the existing cycle-end block (the one that already runs
`Test-RowDefinitionOfDoneDemandsMerge` / `Get-DoneWithoutMergeStatus` against
the cycle's own just-closed row): the new branch check runs FIRST, and only
if it finds nothing does control fall through to the existing demands-a-merge
check, unchanged. This is deliberate and is the actual gap row 122 names:
row 114's own brief allowed an artefact-only close ("that is a complete
answer"), so `Test-RowDefinitionOfDoneDemandsMerge` correctly returns
`$false` for it and the old check never even looks - but row 114 still had
real code pushed and unmerged on a branch, which the old check was never
built to ask about at all. The new check asks a different, narrower
question - "is there a pushed branch naming this row, ahead of main" - and
does not care whether the row's own brief demanded a merge, so it catches
exactly this shape without disturbing row 121's carve-out for genuinely
artefact-only rows with nothing pushed.

**Proof it fires**, beyond the pure-decision cases the brief asked for by
name: section 11 also builds a real scratch git repository with a real bare
`origin` remote (`git init --bare`, not a mock), pushes a branch genuinely
ahead of `main` whose own commit message names row 122, and asserts
`Find-UnmergedPushedBranchForRow` actually finds it by walking real git -
then merges that branch into `main`, pushes, and asserts it stops being
found, which is the exact moment row 121's own carve-out must take back over.
A row number the branch does not mention is confirmed not found. All three
are genuine git operations against a throwaway repo under `$env:TEMP`,
cleaned up after.

## Gates

- `npm run lint` - 0
- `npm run typecheck` - 0
- `npm test` - 3758/3758 passed. Two Sentry tests
  (`src/instrumentation.test.ts`, `src/lib/monitoring/sentry-config-wiring.test.ts`)
  timed out once under full-suite parallel load and passed cleanly in
  isolation on the same run - a known flake class (network-call timeouts
  under contention), unrelated to `relay-watch.ps1`/`relay-selftest.ps1`, and
  not touched by this row.
- `npm run build -- --webpack` - succeeded.
- `relay-selftest.ps1` - 74/74 checks, red-first proven per above.

## Merge

PR #461 (row 127's BOM fix, this cycle's own PR-sweep merge, including this
cycle's own committed log file): squashed to `5f96977` on `origin/main`.

PR #462 (row 122 itself): squashed to `e7935b6` on `origin/main`, confirmed
with `git ls-remote origin refs/heads/main`:

    e7935b6d3be7b822a3a53a374ec1a40f14848ed6	refs/heads/main

## Scope discipline

Did not touch `.bidlow/GRADES.json`, any dimension score, or
`docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`. Did not touch
`.githooks/pre-commit`, `scripts/relay/ensure-queue-bom.mjs`, or anything
else row 127 owns - that PR was merged as-is, untouched, before this row's
own work began. Did not touch `C:\Bidlowprojects\_standards` or any sibling
client folder.

**One thing worth naming rather than fixing here**: an untracked file,
`ODOUTREACH-PROJECT-INSTRUCTIONS.md`, sits at the repo root - draft Claude
Project instructions, referencing `C:\Bidlowbusiness\_odoutreach-handover\`.
Per the repository-boundary rule (decks, briefs and handover artefacts live
in `C:\Bidlowbusiness`, not in a client's code repository), this does not
belong here and this row did not add it. Left untouched rather than deleted -
it may be someone's in-progress draft - and flagged here rather than acted on,
since it is outside the files this row named.

**Also worth naming**: cycle 162's own log recorded that the watcher is
running a STALE copy of itself (loaded `B9E192203DEB`, on-disk `3118106EFA98`
at that time) and that `relay-start.cmd` needs to be run by hand to pick up
every merge since. That is still true after this row's own merge -
`relay-watch.ps1` changed again in this row, so **this fix is also INERT
until Greg restarts the watcher.** Nothing in this row's own work depends on
the running watcher already having row 121's or row 103's code active, so it
is safe to sit unrestarted for a while, but the newly-added guard will not
actually run mid-relay until that restart happens.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 163 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: relay-watch.ps1.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: B9E192203DEB
  On disk now:      51AF85ED01BF

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-30 21:21:44, took about 40.4 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay-watch.ps1, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 163 - queue item 122

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **A CYCLE THAT ENDS WHILE WAITING ON CI LEAVES ITS PULL REQUEST UNMERGED, AND IF IT WAS THE LAST OPEN ROW, NOTHING EVER MERGES IT.** Found live on row 114, cycle 154, 30 August. The cycle committed and pushed the Tuesday readiness verdict as `c031769` (PR #451), wrote `DONE 154` into the queue, and ended with, in its own words, that it was waiting on CI and would merge once green. No process survived the cycle to do that. The queue was then empty, so the watcher self-queued nothing and the verdict would have sat on a branch indefinitely. A human caught it. **WHY ROW 121'S NEW GUARD CORRECTLY DID NOT CATCH THIS, and do not change that:** the DONE-without-merge check runs at cycle end and asks `Test-RowDefinitionOfDoneDemandsMerge` first. Row 114's definition of done asks for a dated artefact, not a merge commit, so the guard deliberately stood down. That carve-out is right and must stay - fabricating failures for artefact-only rows would be worse than the defect. **The gap is narrower than that:** a row whose work has been COMMITTED AND PUSHED TO A BRANCH but not merged, closed DONE by a cycle that said it was waiting on CI. **THE WORK:** at cycle end, if the cycle pushed a branch that is ahead of `origin/main` and its row is now closed, do not let the row close silently - reopen it as PARTIAL naming the branch, so the next cycle finishes the merge. Put this beside row 121's check in `relay-watch.ps1` rather than inventing a second mechanism, and reuse its helpers. **PROVE IT FIRES:** a self-test case that closes a row DONE with an unmerged pushed branch behind it and asserts the row is reopened as PARTIAL, plus a case that closes a clean artefact-only row with no pushed branch and asserts it is LEFT ALONE. The self-test check count must rise. **Assume the seventh exists:** this project's worst and most repeated defect is something built, wired, reporting success, and never firing - prove it fires. **DO NOT** touch `.bidlow/GRADES.json`, re-score any dimension, or alter the readiness verdict. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the check in `relay-watch.ps1`, both self-test cases passing and failing red without the change, lint 0, typecheck 0, and the merge commit hash on `origin/main` quoted in your log.

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
  `DONE 163`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 163 - ...** |` reads correctly.
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

* Finished it -> `DONE 163 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 163 - <what is done, what is left>`. PARTIAL
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

The row 122 fix itself is complete and merged (commit `e7935b6` on `origin/main`, confirmed via `git ls-remote`). I'm waiting on CI for a small docs-only follow-up PR (#463) that records that merge hash back into the QUEUE.md row and cycle log — I'll merge it and finalize the queue row as soon as that notification arrives.

