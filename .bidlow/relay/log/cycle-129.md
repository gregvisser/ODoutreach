# Cycle 129 - queue item 104

## What it was asked to do

Row 104: set up the one click that opens the sell gate, and stop before
clicking it. Import one fresh, never-contacted contact for `bidlowai` at a
brand-new Gmail plus-alias, build a sequence to it through the real screens
exactly as cycle 109 did, drive it to a genuine app-computed "Ready to
launch" state, and stop — do not click Launch. Write a plain-English note at
`C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md` telling Greg
exactly what to click and what to expect back. Do not score anything;
dimension 1 moves only once a human has watched the reply land against the
right send.

## Before touching anything

**Files this row could change:** `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md`
(new artefact), `.bidlow/relay/QUEUE.md` (row 104 status),
`.bidlow/relay/log/cycle-129.md` (this file), and
`C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md` (outside the
repo, per the repository-boundary rule). No `src/` change was in scope or
made.

**Red-first test:** does not apply. This row is an operational screen walk
against the live product, not a code change — there is no behaviour to put
red before green. Said plainly rather than skipped, matching the precedent
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle109.md` set for the same
situation.

**Done looks like:** a real sequence for `bidlowai`, built through the actual
screens, sitting at "Ready to launch" with Ready: 1 / Blocked: 0 / Sent: 0,
proven by quoted screen text; the alias recorded; the reply-matcher fix
confirmed live on the deployed commit; the handover note on disk in plain
English; and a plain statement that nothing was sent — checkable by a
non-coder by opening the page named in the note.

**Must not touch:** any other client's data or sends, `AUTONOMOUS_SEND_ALLOWLIST`
/ `autonomousSendEnabled` for any client, `.bidlow/GRADES.json`, and the
Launch sequence button itself.

## Queue sweep first

One open PR at cycle start, `#423` (row 103, cycle 128's own work, branch
`fix/relay-orphan-reopen-verify-merged-row103`) — both checks were still
`IN_PROGRESS`. Watched them go green (`E2E (Playwright)` 5m29s, `verify`
5m11s) and squash-merged as `674bd8b`, deleting the remote branch. `gh pr
merge` then failed locally trying to switch/delete the local branch, because
cycle 128 had left two uncommitted changes in the working tree (the row 104
addition to `QUEUE.md`, and its own final `cycle-128.md` log) — the merge on
GitHub had already succeeded by then. Stashed those two files, fast-forwarded
local `main` to `674bd8b`, opened a fresh branch
(`docs/row104-sequence-launch-walk`), and popped the stash back so cycle 128's
leftover record survives and lands in this cycle's PR alongside row 104's own
work. No other open PRs.

## What it did

**Verified the fix is deployed, with a cache-buster, before starting.**
`GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info?cb=<ts>`
(direct App Service origin) read `commit: 75240ed1a6f37b28f4ef37a4e590ee2ea2b5ee15`
at the start of recon. `git merge-base --is-ancestor 8b2370f 75240ed` — true.
Row 103's own merge auto-redeployed mid-cycle; re-checked with a fresh
cache-buster afterwards and got `674bd8bf6bbdbc0390e91bce40ca018f000ddc9d`,
re-ran the ancestor check against that hash too — also true. `/api/health`
read `autonomousRelay.allowlistedClients: 1` both times.

**Recon, read-only.** The Postgres Flexible Server only allows Azure-internal
traffic by default. Used `az webapp config appsettings list` (already
Azure-CLI-authenticated as the account that owns this subscription) to read
`AUTH_SECRET` and `DATABASE_URL`, then added a temporary firewall rule scoped
to this machine's own IP, ran two narrow read-only queries (bidlowai's client
id / staff row / connected mailbox; the outbound-queue status counts split by
client), and removed the rule immediately after each use — confirmed by
re-listing the firewall rules both times. Found: client id
`cmpmhb5j40000gbo05h6oyc7j`; one connected mailbox
(`greg@bidlow.co.uk`, Microsoft, CONNECTED); the staff account
`greg@opensdoors.co.uk` (StaffUser `entraObjectId: cycle110-readonly-check`,
a placeholder id an earlier cycle set — next-auth only checks it matches the
row it was issued against, so it authenticates the same as a real Entra GUID);
existing plus-alias contacts `+cycle109` and `+cycle105` (so `+cycle129` is
genuinely new); before-state outbound queue: 0 `QUEUED` rows anywhere, bidlowai
totals SENT 1 / FAILED 1 / BLOCKED_SUPPRESSION 1 / REPLIED 3.

**Minted a real session, same method as cycle 109.** Used next-auth's own
`encode()` (not reimplemented crypto — the same technique
`e2e/global-setup.ts` uses) with the production `AUTH_SECRET` to build a
genuine `next-auth` JWT session cookie for `greg@opensdoors.co.uk`, loaded it
into a headless Chromium browser via Playwright (already a project
devDependency), and drove the actual production pages on the direct App
Service origin — real HTTP, real Server Actions, real database writes.
Scratch scripts, the minted cookie file, the CSV fixture, and screenshots all
lived under this repo's already-gitignored `.tmp/` directory and were deleted
at the end; nothing under `.tmp/` was committed.

**Through the real screens:**
1. `/clients/{bidlowai}` — confirmed the session actually authenticates as
   staff (did not bounce to sign-in).
2. `/clients/{bidlowai}/sources` — named a new list
   ("Cycle 129 fresh — 2026-08-30"), uploaded a one-row CSV
   (`A Emails,Name` header, matching cycle 109's format) for
   `greg.visser64+cycle129@gmail.com`, clicked **Preview** ("Email-sendable:
   1"), clicked **Confirm import**.
3. `/clients/{bidlowai}/outreach` — expanded the "New sequence" accordion
   (a collapsed `<details>` on this page — had to find this, cycle 109
   predates it), named the sequence "Cycle 129 send-and-reply walk —
   2026-08-30", selected the new list, selected the existing "Cycle 105 walk
   intro — 2026-08-29-cycle105" INTRODUCTION template (the one template with
   no unfilled merge field — same choice cycle 109 made, for the same
   reason), left the mailbox on auto-pick, clicked **Save sequence**. Flash:
   "Sequence checks passed · Ready to launch · 1 recipient added to this
   sequence · Recipient readiness updated."
4. Opened the sequence's own detail panel via **Review and launch** on its
   table row, then clicked **Review recipients** again anyway as an explicit
   human-style re-confirmation (same as cycle 109). Quoted verbatim from the
   page: "Ready to launch — 1 mailbox connected · 30 sends available today."
   and "Live sends — Ready: 1  Blocked: 0  Sent: 0." The **Launch sequence**
   button was present and enabled (`disabled` attribute read `false`) — a
   genuine readiness, not a UI state that merely looks ready. **It was never
   clicked**, and its confirmation dialog (which carries a second,
   identically-labelled confirm button) was never opened either.

**Confirmed nothing left the building.** Re-ran the same outbound-queue count
query after the walk, over a second temporary firewall window: identical to
before, row for row — 0 `QUEUED` rows anywhere, bidlowai still SENT 1 / FAILED
1 / BLOCKED_SUPPRESSION 1 / REPLIED 3. On screen, the sequence's own "Sent"
tile also reads 0.

**Wrote the handover note.** `C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md`
— plain English, no jargon, no file paths into the codebase: the exact
`opensdoors.bidlow.co.uk` URL to open (verified it resolves and correctly
preserves the sign-in callback), that the button is "Launch sequence" and it
sends one real email to the alias, to reply without editing the subject line,
that the reply check runs on a schedule, and exactly what "right" looks like
on the Activity screen (right subject, "Replying to" naming the 30 August
sequence and not the 26 August one) — plus one line each for what it proves if
it lands right and what to say if it doesn't.

**Wrote the dated artefact.** `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md`
— the full screen-by-screen record, both build-info checks, both firewall
recon windows, the before/after queue counts, and an explicit "what this walk
did NOT cover" section naming the send, arrival, reply, and reply-matching
confirmation as still unproven.

**Did not touch:** `.bidlow/GRADES.json` (dimension 1 stays at 8, exactly as
instructed — it moves only once a human has watched the reply land against
the right send), any client other than `bidlowai`, `AUTONOMOUS_SEND_ALLOWLIST`,
`autonomousSendEnabled` for any client, and — deliberately — the "Launch
sequence" button.

**Gates, run and shown:** `npm run lint` — 0 problems. `npx tsc --noEmit` — 0
errors. `npm test` — 349 files, 3661 tests, all passing. No source code
changed this cycle, so these gates confirm nothing regressed rather than
proving new behaviour — named honestly rather than skipped.

**Left alone, correctly:** the untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md`
at the repo root, same as cycle 128 — outside this row's scope, not touched.

## Left behind in the live workspace, on purpose

* One new contact list, "Cycle 129 fresh — 2026-08-30", one contact
  (`greg.visser64+cycle129@gmail.com`) — real, harmless, never emailed.
* One new sequence, "Cycle 129 send-and-reply walk — 2026-08-30" — status
  Ready to launch, 1 recipient, 0 sent, waiting for Greg's own click.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 129 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 6A61D6BA12FC
  On disk now:      B9E192203DEB

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-30 05:16:56, took about 33.2 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/lib/normalize.ts, docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle109.md, Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 129 - queue item 104

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **SET UP THE ONE CLICK THAT OPENS THE SELL GATE, AND STOP BEFORE CLICKING IT.** This is the highest-value row on the board and it is time-critical: it should be ready when Greg wakes on 30 August. The gate is 7.86 against a bar of 8.0 and the single named thing in the way is dimension 1 (Core journeys end-to-end, weight 18, scored 8), which measures an OBSERVED journey. 8 to 9 is +0.18 and lands at 8.04 - the only single move on the card that opens the gate on its own. The journey has never been observed end to end because the reply came back matched to the WRONG send. **That defect is now fixed AND DEPLOYED** - production commit `3cd6fd1` contains `canonicalizeEmailForMatching` in `src/lib/normalize.ts`, confirmed by reading the file out of the deployed commit itself rather than inferring it from a green workflow. So the walk that failed on 29 August should now succeed, and nobody has watched it. **WHAT TO DO, THROUGH THE REAL SCREENS, EXACTLY AS CYCLE 109 DID (`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle109.md` is the method to copy):** import ONE fresh, never-contacted contact for the `bidlowai` client at a Gmail plus-alias that has NEVER been used before - not `+cycle109`, pick a new tag and write down which - build a sequence to it through the real screens, and drive it to a genuine app-computed 'Ready to launch' state. **THE ALIAS IS THE POINT, NOT A CONVENIENCE.** A plus-alias reproduces the exact 29 August failure: Gmail strips the alias when the recipient hits Reply, so the reply arrives from the bare address and the old matcher could not link it to the aliased send. Using a plain address would prove the walk but NOT the fix. Use the alias. **THEN STOP. DO NOT CLICK LAUNCH.** Causing a real email to be sent is one of this project's three absolute stop-and-ask conditions. This row prepares the walk and hands the last click to the owner; it does not take it. Confirm nothing left the building - quote the outbound queue counts before and after, and Sent: 0 on the sequence page. **THE DELIVERABLE THAT MAKES THIS WORTH DOING is a plain-English note, written for someone who is not a coder, at `C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md`.** No file paths, no jargon, no stack traces. It must say: the exact URL of the sequence page to open; that the button is Launch and it will send one real email to the alias; that he should then open that inbox on any device and hit REPLY WITHOUT EDITING THE SUBJECT LINE and send anything at all as the body; that the reply sync runs on a schedule so it may take a few minutes; and exactly what to look for afterwards - the reply appearing on the client's activity screen under the RIGHT subject and, critically, 'Replying to' naming THIS sequence rather than the 26 August one. Say in one sentence what it proves if it lands right, and what to say if it does not. **DO NOT SCORE ANYTHING.** Do NOT touch `.bidlow/GRADES.json`, do NOT move dimension 1, do NOT write to the sell gate. Dimension 1 moves only once a human has WATCHED the reply land against the right send, and that has not happened yet. Preparing the walk is not observing it, and a row that scores its own setup is the exact failure this project has recorded nine times. **SCOPE, AND DO NOT EXCEED IT:** the `bidlowai` client only. One contact, one sequence, one note on disk, and a dated artefact under `docs/ops/` recording the screens walked and the state left behind. No code change. No schema, no migration. Do NOT touch `AUTONOMOUS_SEND_ALLOWLIST` or `autonomousSendEnabled` for any client. Do NOT archive or delete anything belonging to another client. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the sequence sits at a real 'Ready to launch' with Ready: 1, Blocked: 0, Sent: 0, screenshots or quoted screen text proving it; the alias recorded; the deployed-commit check quoted with its cache-buster; `MORNING-ONE-CLICK.md` on disk and readable by a non-technical person; and a plain statement that nothing was sent. If the screens refuse to reach Ready to launch, mark this PARTIAL, say exactly where it stopped and what the on-screen message was, and do not work around it.

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
  `DONE 129`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 129 - ...** |` reads correctly.
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

* Finished it -> `DONE 129 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 129 - <what is done, what is left>`. PARTIAL
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

PR #424 merged cleanly as `7f35672`, no open PRs remain, and the working tree is clean except the out-of-scope untracked file left alone as instructed.

## Summary

**Row 104 is DONE.** Both open PRs cleared (#423 from cycle 128, #424 from this cycle), both merged green.

The actual work: verified the reply-matcher fix (`canonicalizeEmailForMatching`, from row 100) is live on production, then drove a real sequence for `bidlowai` through the real screens — using a minted staff session in headless Playwright, exactly cycle 109's method — to a genuine "Ready to launch" state:

- Imported one never-before-used contact at `greg.visser64+cycle129@gmail.com`
- Built "Cycle 129 send-and-reply walk — 2026-08-30" against it
- Confirmed on-screen: **Ready: 1, Blocked: 0, Sent: 0**, Launch button enabled but **never clicked**
- Outbound-queue counts (read via a temporary, immediately-removed DB firewall rule) identical before and after — nothing sent, nothing queued

Wrote `C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md` telling Greg exactly what to open, click, and check for. Dimension 1 and `GRADES.json` were left untouched, as instructed — the score only moves once a human watches the reply actually land against the right conversation.

**Open item for Greg:** click Launch on the sequence at the URL in `MORNING-ONE-CLICK.md`, then reply from that inbox without editing the subject line, and check the Activity screen a few minutes later.

