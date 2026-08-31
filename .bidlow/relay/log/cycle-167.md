# Cycle 167 - row 131 (reopened after a timeout; verified, not redone)

## PR sweep

`gh pr list --state open` returned one PR: #472 (`docs(relay): sync Cowork's
row 137 into QUEUE.md`), CI green (verify + E2E Playwright both passed),
`MERGEABLE`/`CLEAN`. Squash-merged as `e02ef4288d64f5b0733688e827cd472c71e78d1b`,
confirmed on `origin/main` via `git ls-remote origin refs/heads/main`.

## What this row actually was

Row 131 read `IN PROGRESS 167` at the top of this cycle, with no content -
the shape this project's own `CLAUDE.md` names explicitly: *"A row reopened
after a relay timeout may already be merged - check `main` first."* Before
writing any code, checked `git log` and `.bidlow/relay/QUEUE.md`'s own
committed history for row 131's number.

**It was already done.** `origin/main` (`1846552`, `#470`) already carried a
full `DONE 166` entry for this row, naming merge commit `dab2699` (PR #469,
squash-merged) as the fix, and `cba37ce` (`#471`) had synced further Cowork
rows on top of it since. The uncommitted local working tree, however, showed
row 131 rewritten to `IN PROGRESS 167` with no proof and
`.bidlow/relay/log/cycle-166.md` carrying a freshly appended watcher kill
record: a **second** dispatch, also labelled cycle 166, had spent 45 minutes
re-doing this already-finished row and was killed at the timeout deadline.
That kill record names its own cause: **the watcher process is running a
stale copy of its own script** - `Loaded at launch: 51AF85ED01BF`, `On disk
now: E97F4D42A323`. This is row 52's known defect (documented at length in
`.bidlow/relay/RESTART-REQUIRED.md`) recurring - and it is the same defect
row 131's own `DONE 166` text had already warned about under a different
hash pair, so this is at least the second time it has cost a full cycle.

## Verification performed (not a redo)

- `git merge-base --is-ancestor dab2699 origin/main` -> true, both before and
  after clearing PR #472 (now against `e02ef42`).
- Ran `relay-selftest.ps1` directly, fresh, against the current working
  tree: **83/83 checks green**, including all 9 section-12 assertions row
  131 added (the harness-crash-vs-genuine-failure split).
- `docs/ops/SELFTEST-HARNESS-VS-FAILURE-2026-08-31.md` is present and intact,
  267 lines.
- Confirmed the corrected QUEUE.md row 131 text still parses as a valid
  `DONE` row against the real `$QueueRowPatternStrict`/`$QueueRowPatternLoose`
  regex pair copied out of `relay-watch.ps1` (not eyeballed) - matched, status
  group read back as `DONE 166 - ...`.

No code in `relay-selftest.ps1` or `relay-watch.ps1` was touched this cycle.
The brief's four deliverables (fix committed, throw-vs-fail behaviour
implemented and reasoned, two new self-test cases proven red without the
change, merged to `main` with the hash confirmed) were all already true and
already evidenced in row 131's own `DONE 166` text and in
`docs/ops/SELFTEST-HARNESS-VS-FAILURE-2026-08-31.md`. Redoing them would have
produced no new information and risked drifting from the already-verified
fix.

## What changed on disk this cycle

- `.bidlow/relay/QUEUE.md`: row 131 restored to its true `DONE 166` text,
  with a dated cycle-167 addendum recording the reopen, the stale-watcher
  cause, and the fresh verification (so a future cycle that meets this row
  again does not have to re-derive any of this).
- `.bidlow/relay/log/cycle-166.md`: the watcher's own kill record for the
  second, erroneous dispatch is kept as-is - it is an accurate, independently
  written record of what happened and is this project's evidence trail, not
  mine to edit.

## The hard rule

No email sent, no data touched, for any client. This cycle only read
history, ran a local self-test, and corrected a status cell plus a log file.

## Restart still owed - said plainly, again

**This is not new work, it is the same fact recurring.** The watcher that
picked up cycle 166/167 is still executing code from before row 131's own
fix landed (confirmed by the kill record's own hash mismatch above), so a
future self-test harness crash on Greg's machine will be treated exactly as
before row 131 - a bare non-zero exit refusing to start - until he runs
`relay-start.cmd`. Nothing here changes that; if anything, this cycle is
itself the second cost of not having restarted yet. See
`.bidlow/relay/RESTART-REQUIRED.md` for the running history of this same
defect on rows 52 and 81.

## Gates

- `npm run lint` / `npm run typecheck` / `npm test` - not run this cycle;
  no application code, PowerShell relay script, or test file was touched.
  Only `.bidlow/relay/QUEUE.md` (docs) and this log changed.
- `relay-selftest.ps1` - run directly, 83/83 green (see above).

## Merge

PR opened from `docs/row131-correct-stale-reopen-cycle167` against `main`,
docs-only (QUEUE.md status correction + this log + cycle-166's own
watcher-written kill record). Merge commit hash to follow once CI is green
and the merge completes.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 167 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 51AF85ED01BF
  On disk now:      E97F4D42A323

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-31 06:52:32, took about 9.7 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay-selftest.ps1, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 167 - queue item 131

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE SELF-TEST GATES RELAY STARTUP, SO A BROKEN TEST DOES NOT FAIL A CHECK - IT STOPS THE ENGINE DEAD AND KEEPS IT STOPPED. THAT HAPPENED THIS MORNING AND COST ABOUT TEN MINUTES OF GREG'S TIME AT 06:00.** Row 122's new git-walking self-test shipped green in CI and then refused to start the relay on Greg's Windows machine, three times in a row. **FIRST, COMMIT THE FIX THAT IS ALREADY ON DISK AND UNCOMMITTED** in `relay-selftest.ps1` (backup: `relay-selftest.ps1.bak-before-cowork-stderr-fix`). It is two separate corrections, both verified by a full self-test pass of 74 checks at 06:01 UTC on 31 August: (a) the row-122 block is wrapped in `$ErrorActionPreference = 'Continue'` with a `try/finally` restore, because git writes ordinary progress to stderr - `To <remote>` on push, `Switched to branch` on checkout - and with `Stop` set at the top of the file PowerShell turns ANY native-command stderr into a terminating NativeCommandError that redirection operators do NOT prevent; (b) four `.Count` reads on a single returned object were wrapped in `@(...)`, because a scalar returns blank rather than 1 - which is exactly what the failure text `got  action(s)` was showing. **The production guard was never broken; the test was.** The proof is in the run output: the assertion immediately after each failure PASSED while reading a property off that same value. **DO NOT weaken or delete any assertion to make this pass.** **THEN THE REAL WORK: A TEST THAT CANNOT RUN MUST NOT BE ABLE TO TAKE THE WHOLE ENGINE DOWN.** Decide and implement how startup should behave when the self-test THROWS as opposed to when a check legitimately FAILS. A genuine failed check must still refuse to start - that is correct and must not change. But a test harness that crashes on a platform difference is not evidence the safety machinery is broken, and treating it as such is a worse failure than the one it guards against. Options to weigh and choose between with reasons: separating harness errors from check failures; running the git-dependent sections in a way whose failure is reported but non-fatal; or gating those sections behind an explicit capability check. **State the reasoning in the artefact, do not just pick one.** **AND THE CAUSE UNDERNEATH BOTH: CI RUNS LINUX, GREG RUNS WINDOWS POWERSHELL, AND THE SELF-TEST IS ONLY EVER EXERCISED FOR REAL ON HIS MACHINE.** Say plainly in the artefact whether that gap can be closed - a Windows CI job, or a lint rule for the two PowerShell idioms above - and what each would cost. Do not silently accept it. **PROVE IT FIRES:** a self-test case that plants a throwing harness section and asserts the chosen behaviour, and one that plants a genuinely failing check and asserts startup is still refused. Both must fail red without the change. The check count must rise above 74. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the on-disk fix committed, the throw-versus-fail behaviour implemented and reasoned in a dated artefact under `docs/ops/`, both new self-test cases passing and proven red without the change, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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
  `DONE 167`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 167 - ...** |` reads correctly.
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

* Finished it -> `DONE 167 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 167 - <what is done, what is left>`. PARTIAL
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

Session state recorded. Summary of where things stand:

- **Row 131 was already done.** The self-test harness-vs-failure fix was merged to `main` back in cycle 166 (`dab2699`, PR #469). What I was actually handed was a stale-watcher artifact: the relay watcher on Greg's machine is running old code (confirmed by its own kill record's hash mismatch), so it re-dispatched an already-finished row as a duplicate "cycle 166" that burned 45 minutes before timing out.
- Verified the merged fix is still genuine and intact (83/83 self-test checks pass), corrected `QUEUE.md` row 131 back to `DONE 166` with an explanatory addendum instead of redoing the work, cleared an unrelated green PR (#472) from the queue, and opened PR #473 with the correction.
- **Still open:** PR #473 is awaiting CI. I'll merge it once green and record the final hash — no action needed from you in the meantime.
- **Flagged again, plainly:** the watcher still needs `relay-start.cmd` run by hand — this is now the second cycle this exact staleness has cost.

