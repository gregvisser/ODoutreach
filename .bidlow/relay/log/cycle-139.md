# Cycle 139 - queue item 111

## Before anything else: the four things written down

1. **Files I might change:** `.bidlow/relay/QUEUE.md` (row 111's status cell
   only), `.bidlow/relay/log/cycle-139.md` (this file), a new dated artefact
   `docs/ops/2026-08-30-screen-walk-findings-row111.md`. Regenerating
   `e2e/.artifacts/screen-walk/*.json` (already gitignored, not a tracked
   file). No application code, no schema, no copy change — row 111 is
   explicitly measure-only.
2. **The red-first test:** none in the usual sense — this row is measurement,
   not a behaviour change, so there is no red/green to watch. The harness
   itself (`e2e/screen-walk.spec.ts`) already exists and already asserts the
   mechanical checks; re-running it and reading its output honestly (not
   inventing new assertions) is this repository's substitute here.
3. **What "done" looks like, in one sentence a non-coder can check:** a dated
   file exists under `docs/ops/` with a numbered, ranked list naming, for
   each finding, the screen, the exact words on it, what a new operator would
   wrongly conclude, and what is actually true — and the screen count is
   stated.
4. **What I must NOT touch:** any application/source file (no fix, per the
   row's explicit instruction — fixes belong to row 112); `.bidlow/GRADES.json`
   (no scoring, per the row — that is row 114's job); the `bidlowai`
   "Cycle 129 send-and-reply walk" sequence (must stay untouched at
   Ready: 1, Sent: 0); any other client's data beyond read-only viewing
   through the existing e2e fixture.

## Sweep: green PRs

Found the row-115 branch (`docs/row115-send-proof-cycle138`, PR #437) sitting
with two uncommitted local files from cycle 138's own working tree: the
watcher's post-exit addendum to `cycle-138.md` and the picker's own
`IN PROGRESS 139` marker on row 111 in `QUEUE.md`. Neither belonged to a new
row — both were cycle 138's own record and this cycle's own pickup marker —
so committed them to that same branch, pushed, waited for CI (green: `verify`
and `E2E (Playwright)` both `pass`, ~5.5 minutes), and squash-merged PR #437.
No other open PRs (`gh pr list --state open` returned empty after the merge).

## Row 109 gate / prerequisites

Not applicable to this row — row 111 has no dependency on row 109 being live;
it is a fresh measurement pass over the current product.

## The walk

Ran the existing, named method exactly as instructed — did not invent a new
one:

1. `E2E_DATABASE_URL=... npx prisma migrate deploy` against the already-running
   `odoutreach-e2e-postgres` container (`:5434`) — no pending migrations.
2. `npm run build` — production build, matching CI and Azure.
3. `npx playwright test e2e/screen-walk.spec.ts --reporter=list` — **32/32
   passed**, artefacts regenerated at `e2e/.artifacts/screen-walk/*.json`
   (gitignored, not committed — same as every prior run).

Then read every one of the 32 artefacts' rendered text, and for anything that
looked like a real finding, read the actual source file computing that number
or copy string before writing it down — so the artefact states causes, not
guesses. One artefact-reading mistake caught and corrected before it became a
false finding: `reporting-detail` was walked with no `metric` query
parameter (the harness's own navigation choice), which is not how any real
on-screen link reaches that page — every real link always carries a `metric`
value (`detailHref(...)` in `reporting/page.tsx`). The generic "That metric
doesn't have a row-level breakdown" text the harness captured there is a
harness artefact, not a real dead end, and is called out as such in the
findings file rather than listed as a finding.

**The one gap in the harness, named plainly:** the e2e fixture client has no
sequence in any state, so `screen-walk.spec.ts` cannot observe the Outreach
tab's Launch button, its dialog, or its post-launch state — the exact
stretch row 111 says to walk hardest. Rather than inventing a new fixture or
a new test (out of scope — no source change, and the row says use the
existing method), the highest-ranked finding was built by reading two
real-production walks of that exact screen that already exist on disk —
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md` and
`docs/ops/SEND-PROOF-2026-08-30.md` — cross-referenced against the actual
source (`sequence-actions.ts`) that generates the copy those two documents
quote verbatim. No new screen interaction was performed to produce this; both
source documents already existed before this cycle started.

## Findings, in brief (full detail in the artefact)

Seven findings, ranked by damage:

1. The post-Launch banner always reads "queued," even once the send has
   already completed via the real mailbox — the literal scenario Greg
   described.
2. The Do-not-contact tab shows a "sync isn't set up" banner directly above
   two rows reading "Sheet connected" / "Last sync succeeded."
3. Client Overview says Do-not-contact is "Not configured" for a client
   whose own Do-not-contact tab shows it actively blocking 250+ addresses.
4. Client Overview's "Lists" figure is actually a contact count, and
   disagrees with the client's own Lists tab (which reads zero lists).
5. A template status "IN REVIEW" is described only as "Legacy status," with
   no statement of whether it can be used in a sequence today.
6. An outbound email's detail screen can show "Provider: mock" with no
   on-screen explanation of what that means.
7. The cross-client Operations table shows the same unexplained "Legacy
   transport: mock" as a workspace's entire sending state.

No actively dangerous mislabeled control (one that could send or delete
while its label says otherwise) was found — stated plainly at the top of the
artefact per the row's instruction.

## Hard rule and scope

No email sent, no client data mutated beyond what the existing e2e fixture
seeds when the harness runs (the same fixture every prior run of this spec
has created). `bidlowai`'s "Cycle 129 send-and-reply walk" sequence was not
opened, touched, or launched. No other client's real data was read — only
the isolated e2e fixture database. No code, schema, or copy change.
`.bidlow/GRADES.json` was not touched.

## Gates

- `npm run lint` — 0 problems.
- `npm run typecheck` — 0 errors.
- `npm test` — 353 files, 3711 tests, all green.
- `npx playwright test e2e/screen-walk.spec.ts` — 32/32 passed.

No application code changed, so these gates prove the tree is exactly as
clean as it started, not that a new behaviour works — correct for a
measure-only row.

## Status

`DONE 139` — see `docs/ops/2026-08-30-screen-walk-findings-row111.md` for
the full ranked findings list and the 32-screen count.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 139 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: B9E192203DEB - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 09:41:07, took about 30.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: e2e/screen-walk.spec.ts, e2e/.artifacts, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 139 - queue item 111

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **WALK THE WHOLE PRODUCT AS A NEW EMPLOYEE WHO HAS NEVER SEEN IT, AND WRITE DOWN EVERY PLACE IT DOES NOT TELL THEM WHAT JUST HAPPENED. MEASURE ONLY - FIX NOTHING IN THIS ROW.** Greg set the standard himself on 30 August, after clicking Launch and being unable to tell whether an email had gone: 'the send page is very confusing... i dont know if anything has actually been sent? if im not sure whats going on in this screen, how would a employee?' That is the test every screen has to pass. **THE METHOD ALREADY EXISTS - USE IT, do not invent one.** `e2e/screen-walk.spec.ts` opens the staff-facing screens against a LOCAL PRODUCTION BUILD (`npm run build`, then `npm run start`) as a signed-in super admin and records each screen's rendered text, load time, console errors, page errors and failed requests to `e2e/.artifacts/screen-walk/*.json`. That is how the customer-ready grade was originally produced. Re-run it, and then WALK THE RESULT WITH JUDGEMENT - the artefacts tell you what a screen said, not whether a human could act on it. **WHAT COUNTS AS A FINDING, and be strict:** a screen that looks identical before and after a consequential action; a state with no explanation and no next step; a control whose effect you cannot predict from its label; an error or empty state that names no cause; a number a reader cannot trace to anything; two screens that disagree; an instruction that assumes knowledge a new operator has not got. A finding is NOT 'I would have designed this differently' - it is 'a competent person would not know what to do here'. **COVER THE WHOLE OPERATOR PATH, not just the pretty screens:** creating a client, connecting a mailbox, importing a list, building a template, building a sequence, reviewing recipients, launching, and then reading what came back on Activity and Replies. The launch and post-launch stretch is where the known failure is, so walk it hardest. **THE DELIVERABLE IS ONE DATED ARTEFACT under `docs/ops/`,** a numbered list, each entry naming: the screen, the exact words on it, what a new operator would reasonably conclude, what is actually true, and one sentence on what it should say instead. Rank them by how much damage the confusion does - a wrong belief about whether an email was sent ranks above a fuzzy label. Say how many screens were walked, so the count is auditable. **FIX NOTHING.** Measuring and fixing in one cycle produces neither properly, and the fixes belong to row 112 where they can be argued about one at a time. If you find something actively dangerous - a control that could send or delete when its label says otherwise - STOP, say so at the top of the artefact, and change nothing. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. Row 114 does the scoring, once, from this evidence. **SCOPE:** running the walk, reading its artefacts, and writing the findings artefact. No source change. No send - the `bidlowai` sequence 'Cycle 129 send-and-reply walk - 2026-08-30' stays untouched at Ready: 1, Sent: 0 waiting for the owner's own click, and no cycle may launch it. No client data mutated beyond what the existing walk fixture already creates. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the dated artefact on disk with a numbered, ranked findings list and the screen count; the raw walk artefacts regenerated; lint 0, typecheck 0, the full unit suite green, merged to `main`.

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
  `DONE 139`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 139 - ...** |` reads correctly.
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

* Finished it -> `DONE 139 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 139 - <what is done, what is left>`. PARTIAL
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

Confirmed: row 111 is correctly marked `DONE 139` on `main`, working tree is clean (the untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` predates this cycle and is unrelated — left untouched).

## Summary

Cycle 139 is complete:

1. **PR sweep**: Merged the one open PR (#437, row 115's send-proof docs) after committing the watcher's leftover addendum and waiting for green CI.
2. **Row 111 (screen walk)**: Re-ran `e2e/screen-walk.spec.ts` against a fresh local production build — 32/32 screens passed mechanically. Read every artefact with judgment, traced source code behind anything suspicious, and wrote 7 ranked findings to `docs/ops/2026-08-30-screen-walk-findings-row111.md`. Top finding directly reproduces Greg's own complaint: the post-Launch banner always says "queued" even after the email has actually sent (evidenced by cycle 138's real send proof, cross-referenced against source). Other findings cover contradictory do-not-contact status between screens, a mislabeled contact-count-as-"Lists", and unexplained "mock" provider labels. No dangerous mislabeled control was found. No source code changed, no send occurred.
3. **Gates**: lint 0, typecheck 0, 3711 unit tests green, PR #438 merged to `main` at `1d03d08`.
4. Row 111 marked `DONE 139` in QUEUE.md.

Open question for whoever picks up row 112: the findings artefact identifies concrete root causes (e.g., two different truthiness checks on suppression-source data, `counts.queued` reflecting intake rather than dispatch state) that should make the fixes there fairly direct.

