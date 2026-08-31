# Cycle 207 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: DF0DA734E35C
  On disk now:      3ABAA45FD1AB

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-31 21:39:14, took about 58.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md, activity/page.tsx, setup-help/page.tsx, templates/page.tsx, outreach/page.tsx, mailboxes/page.tsx, src/server/tenant/access.ts, staff-access/actions.ts, training/staff-handover/page.tsx, training/page.tsx, docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 207 - queue item 148

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **RAISED BY ROW 134 (cycle 192) - THE TRAINING CONTENT HAS TWELVE CONFIRMED DRIFT DEFECTS AGAINST THE LIVE PRODUCT.** Read `docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md` for the full evidence and citations before starting - do not re-derive it from scratch. All twelve are copy-only fixes inside `src/lib/training/` (`modules.ts`, `staff-handover-guide.ts`) plus, where noted, a workspace-nav reference; no schema or send-path change. Ranked highest first: **(1) worked-example template body still contains `{{email_signature}}`** (`modules.ts:149-150`, reused at `:903-907`) - a regression of the exact bug the same module warns against two paragraphs later (`:814,875`) and the same class as Lucy's twice-raised signature ticket - remove the line. **(2) Sources module wrongly claims LinkedIn/phone-only rows are "valid" and get imported** (`modules.ts:516,552`) when `contact-import-contract.ts:12-14,54` (`EMAIL_REQUIRED_FOR_PERSISTENCE`) and `import-preview.ts:19-24` show they are `skipped`, not persisted - correct the claim. **(3) mailbox connect/reconnect/signature-editing described as admin-only** (`modules.ts:413,447,469,1062`, `staff-handover-guide.ts:23,38`) when `mailbox-setup-access.ts:9-14` (`canAccessMailboxSetupTools` always `true`) and the mailboxes page itself show it is open to all staff - and the training's own video script already says so correctly (`modules.ts:1353`), disagreeing with the module text in the same file - align the module text to the video script. **(4) Activity module tells staff to use a sidebar link and cross-client page removed and made admin-only in PR #140** (`modules.ts:926,950-953,980-981,1000-1004`; contradicts `activity/page.tsx:32-49`, `nav-config.ts:41-46`, and again disagrees with the module's own video script at `modules.ts:1479`) - rewrite to describe per-client Activity only. **(5) the real, current "Setup help" workspace tab (added 2026-08-28,** `client-workspace-subnav.tsx:39-43`, `setup-help/page.tsx:19-33`, the page staff hand to a customer's IT department) **is missing from every tab-row list** (`modules.ts:227,1030`, `staff-handover-guide.ts:87,118`) - add it. **(6) Outreach module conflates template authoring with the Outreach tab** (`modules.ts:810-811,836-839`) when template creation moved to a dedicated Templates tab (`templates/page.tsx:70-81`, `outreach/page.tsx:166-182`) - split or re-sequence. **(7) "internal verification" taught as an Outreach step** (`modules.ts:861-864`) when `InternalProofSendCard` now renders on Mailboxes (`mailboxes/page.tsx:8,315`; the Outreach page documents its own removal at `outreach/page.tsx:252-257`) - move the step. **(8) sidebar screenshot alt text stale by three missing items** ("Replies to answer", "Google logins", "Support") **and one removed item** ("Activity") **against `nav-config.ts:50-75`** (`modules.ts:1046,1048`) - refresh alongside fix (4). **(9) manual-signature button misnamed "Edit manual signature"** when the real button reads "Set signature" (`client-mailbox-identities-panel.tsx:1196`), **and the 1-click "Set branded signatures" generator** (`:978`) **is undocumented** - fix the name, add a step. **(10) the real 10-day list-reuse cooldown and its staff-usable "re-engage" override** (`src/server/tenant/access.ts:28-36`, `canUseCooldownReengage`) **are undocumented** - add a line to `outreachModule` or `contactsModule` (directly relevant to row 134's Q2 findings on cooldown). **(11) dev-isms rendered straight to operators** - a raw enum pair and a PR number in a live step body (`modules.ts:735`: "No raw enum chips like EMAIL/SUCCESS - that copy was retired in PR #138"), plus PR numbers in screenshot captions and video scripts (`:1048`, `staff-handover-guide.ts:88`, several `STAFF_VIDEO_SCRIPTS` entries) - strip them from operator-facing body/step/caption strings (source comments are fine). **(12) Settings module's "Only admins can change this" role language** (`modules.ts:1060-1062`) **reads broader than what the product enforces** (`staff.ts:171-178`, `staff-access/actions.ts:59-62`: roles now only gate the staff roster itself, not day-to-day workspace actions) - add one clarifying sentence; this is the root language findings (3) and (9) contradict elsewhere. **ADDED BY ROW 136 (cycle 197), TWO MORE CONFIRMED FINDINGS, SAME CLASS - fold into this row rather than opening a new one:** **(13) the `staff-handover` guide (`src/app/(app)/training/staff-handover/page.tsx`) is a navigation dead end** - nothing in `training/page.tsx`, any `[moduleId]/page.tsx`, or `nav-config.ts` links to it; an operator can only reach it by already knowing the exact URL - add a link from the training index. **(14) the printed checklist tells an operator to open "the sidebar, titled 'People blocked from outreach'"** (`modules.ts:1234-1237`) but the real sidebar label is **"Blocked contacts"** (`nav-config.ts:66`) - "People blocked from outreach" is only the page's own `<h1>`, never sidebar text - correct the checklist line. Evidence for both in `docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md`. **DO NOT SCORE ANYTHING.** **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** all twelve corrections shipped, any lock-down test that asserted the old copy (e.g. `modules-staff-readiness.test.ts`) updated to assert the new copy, lint 0, typecheck 0, a dated artefact under `docs/ops/` listing every fix against this row's numbering, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. If the scope proves too large for one PR, ship in priority order and mark the row PARTIAL with what's left.

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
  `DONE 207`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 207 - ...** |` reads correctly.
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

* Finished it -> `DONE 207 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 207 - <what is done, what is left>`. PARTIAL
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

Cycle 207 complete. Row 148 (all fourteen training-content drift defects) is `DONE 207`, merged to `main` at `66bec14` (code) and `d4984b8` (hash record), with session continuity recorded in `STATE.md` at `1b4a96e`. No open PRs. The only leftover is the pre-existing uncommitted `.bidlow/relay/log/cycle-206.md` (watcher bookkeeping, out of this row's scope, noted in STATE.md for the next session).



## Cross-project deck

regenerated C:\Bidlowprojects\bidlow-deck.html
