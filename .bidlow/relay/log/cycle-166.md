# Cycle 166 - row 131

## PR sweep

`gh pr list --state open` returned zero open PRs. Nothing to merge or chase.

## Leftover uncommitted state found at cycle start, investigated before touching anything

`git status` at the start of this cycle showed three files already modified
in the working tree, none of them mine: `.bidlow/relay/QUEUE.md`,
`.bidlow/relay/log/cycle-165.md`, and an untracked
`ODOUTREACH-PROJECT-INSTRUCTIONS.md`.

- `cycle-165.md` had gained the watcher's own auto-appended record of cycle
  165 (192 lines, starting "## The watcher's own record of this cycle") —
  legitimate, machine-written, additive. Left as-is and carried into this
  row's commit since it shares the same file as this row's own QUEUE.md edit.
- `QUEUE.md` had two changes: row 92 closed `DONE` by "the supervisor" (a
  prior Cowork session, per the note in its own status cell), correctly
  superseded by row 128's dimension-1 rescore which is already merged
  (`c88702c`, `f447fdc`) — checked and consistent, left as-is; and row 131
  itself already written in as `IN PROGRESS 166` by the watcher when it
  handed out this cycle, which is expected.
- `ODOUTREACH-PROJECT-INSTRUCTIONS.md` is untracked, not named by this row,
  and not something a prior cycle's log claims — left completely alone, not
  committed, not read for scope.

The watcher's own appended note inside `cycle-165.md` also flagged: **"RESTART
REQUIRED - this watcher is running a STALE copy of its own script"** (loaded
`B9E192203DEB`, on disk `51AF85ED01BF`). This matters directly to this row's
own work — see "Restart required" below.

## The work

1. **Committed the on-disk fix**, already present and uncommitted in
   `relay-selftest.ps1` before this cycle started (backup on disk:
   `relay-selftest.ps1.bak-before-cowork-stderr-fix`, gitignored, not
   touched). Re-verified independently: 74/74 checks green before any new
   work was added on top.
2. **Implemented the throw-vs-fail behaviour.** New pure function
   `Get-SelfTestOutcome` in `relay-selftest.ps1` turns `(Failures, Passes,
   HarnessError)` into an exit code (0 pass / 1 real failure / 2 harness
   crash with zero failures). The entire self-test body is now wrapped in one
   outer `try/catch` so a future crash anywhere is caught rather than killing
   the process uncaught. New pure function `Get-SelfTestStartupDecision` in
   `relay-watch.ps1` is what the real startup gate now calls: exit 1 still
   refuses to start (unchanged); exit 2 starts anyway but writes a
   `SELFTEST-HARNESS-ERROR.md` artefact and sends a distinctly-worded alert,
   so it is never silent. Full reasoning for the three options weighed, and
   the CI-gap question, is in
   `docs/ops/SELFTEST-HARNESS-VS-FAILURE-2026-08-31.md`.
3. **Two new self-test cases** (section 12, relay-selftest.ps1): a planted
   `throw` proves the outer catch actually catches, then feeds it through
   `Get-SelfTestOutcome`/`Get-SelfTestStartupDecision` and asserts the relay
   is NOT refused; a planted genuine failure asserts it IS still refused,
   including when a crash follows it. 9 new assertions, checks 74 → 83.
   **Proven red without the change**, by temporarily undoing each half of the
   fix and re-running: removing `Get-SelfTestStartupDecision` entirely made
   the self-test itself crash with `SELF-TEST HARNESS ERROR - 78 check(s)
   passed before the harness itself crashed`; restoring it but flipping its
   harness-error branch to `ShouldStart = $false` produced a genuine `FAIL`.
   Both reverted and the full run re-confirmed green at 83/83 before
   proceeding. Full transcript of both red runs is in the artefact.

## Gates

- `npm run lint` — clean, zero output.
- `npm run typecheck` — clean, zero output.
- `npm test` — 362 files / 3772 tests passed. Two Sentry-config tests
  (`src/instrumentation.test.ts`,
  `src/lib/monitoring/sentry-config-wiring.test.ts`) timed out on the first
  full-suite run under parallel load; re-run individually they pass in under
  1s each, and a second full-suite run passed clean at 3772/3772 — confirmed
  flaky under load, not caused by this row (no application TS/JS file was
  touched; only the two PowerShell relay scripts and this docs artefact).
- `relay-selftest.ps1` itself — 83/83 checks green, run directly (not part of
  `npm test`, per this file's own header comment on why it is a startup gate
  and not a CI job).

## The hard rule

No email sent, no data deleted, for any client. This row touched only two
PowerShell relay-ops scripts, one docs artefact, and this log/QUEUE.md — no
send path, no client data, no schema.

## Restart required — this row's own change is inert until Greg restarts

Per this project's own `CLAUDE.md`: `relay-watch.ps1` is dot-sourced once, at
process launch, and an already-running watcher keeps executing whatever was
in memory then. **`Get-SelfTestStartupDecision` and the updated startup-gate
wiring merged in this row do nothing until Greg runs `relay-start.cmd` by
hand.** Until that restart, a future self-test harness crash will still be
treated exactly as before this row — a bare non-zero exit code refusing to
start — which is the exact failure mode this row exists to fix. This is on
top of, not instead of, the pre-existing stale-watcher note already found in
`cycle-165.md`'s own appended section (loaded `B9E192203DEB`, disk
`51AF85ED01BF`) — that restart was already owed before this row added a
second reason for one. Do not report this as fixed on merge alone; the
acceptance test is a future cycle log line beginning `Watcher script:` naming
this row's own merge commit hash, and none exists yet.

## Merge

See QUEUE.md row 131 for the merge commit hash and the `git ls-remote`
confirmation, recorded there once the PR is actually merged (the hash cannot
be known before that).


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 166 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 51AF85ED01BF
  On disk now:      E97F4D42A323

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-31 06:06:18, took about 45.2 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay-selftest.ps1, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 166 - queue item 131

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
  `DONE 166`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 166 - ...** |` reads correctly.
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

* Finished it -> `DONE 166 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 166 - <what is done, what is left>`. PARTIAL
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


