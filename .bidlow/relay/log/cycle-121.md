# Cycle 121 - queue item 97

## First: the PR sweep

`gh pr list --state open` returned zero open PRs at cycle start. Nothing to
merge, nothing to comment on.

## What was found on disk before touching anything

`git status` at session start already showed uncommitted local modifications
to `.bidlow/relay/QUEUE.md` and `.bidlow/relay/log/cycle-120.md`, plus an
untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md`. This matches exactly what
cycle 120's own log (and commit `062e21e`, "flag a live, uncommitted row-97
edit found on disk after cycle 120's merge") said it found and deliberately
left untouched: row 97 in `QUEUE.md` had already been rewritten - by someone
or something outside this cycle - to carry the full "STOP RETRYING THIS ROW"
resolution text and a status of `IN PROGRESS 121`, and `cycle-120.md` already
carried the watcher's own automatic end-of-cycle appendix. Cycle 120 correctly
declined to commit either since row 97 was not its row to close. This cycle's
brief is that same row-97 text, handed down verbatim as "the item, verbatim
from the queue."

`ODOUTREACH-PROJECT-INSTRUCTIONS.md` remains untouched and unstaged - it is
unrelated to this row, exactly as cycle 120 recorded.

## The four things, written down before acting

1. **Files to change:** `.bidlow/relay/QUEUE.md` (row 97's status cell only)
   and `.bidlow/relay/log/cycle-121.md` (this file). The already-present,
   uncommitted `cycle-120.md` watcher appendix travels in the same commit
   since it is legitimate prior record, not new work.
2. **Red-first test:** does not apply. This row is a closeout of a
   documentation/status claim, not new code - there is nothing to make a test
   go red against. The verification substitute here is reading the cited
   artefact and confirming its claims match what the row asserts, which is
   what the next section does.
3. **Done looks like:** row 97's status cell begins `DONE 121` and states, in
   the order the row demands, that the objective was met on 29 August rather
   than by this run, that the Chrome extension was never available to the
   relay, and that a scripted-browser substitute was deliberately not used.
4. **Not touched:** no code, no schema, no `AUTONOMOUS_SEND_ALLOWLIST` or
   `autonomousSendEnabled`, no other queue row, no second email.

## Verifying the claim before closing it, rather than taking the brief's word

Read `docs/ops/SEND-PROOF-2026-08-29.md` in full rather than trusting the
brief's summary of it. It confirms: a real `OutboundEmail` row for `bidlowai`
was queued, attempted and sent within 1.2 seconds at 22:45:53-54 UTC on 29
August, via Microsoft Graph, through the sequence's real Launch button
(clicked by Greg's own real staff session, not scripted), with no bounce on
re-read, and a read-only screen check afterwards showing "Sent: 1" and the
send listed on the client's Activity tab. The recipient recorded is
`greg.visser64+cycle109@gmail.com` - a Gmail plus-alias of the row's named
acceptance address, delivering to the same inbox - and the document itself
notes the owner separately confirmed receiving it. This matches what row 97's
own text asserts. No new send was performed to check this a second time, per
the row's explicit instruction not to send a second email to prove a point
already proven.

Also confirmed cycle 119's refusal is what it claims to be: it is the cycle
that ran the exhaustive `ToolSearch` across Chrome-extension/browser-automation
names and found nothing exposed to an unattended relay cycle. This cycle did
not re-run that search, per the row's instruction, and the deferred-tool list
visible in this session's own system reminders (CronCreate, TaskCreate,
SendMessage, WebFetch, WebSearch, etc.) confirms nothing resembling an
interactive Chrome extension is on offer here either - consistent with, not a
fresh discovery superseding, cycle 119's finding.

## What was done

Edited row 97's status cell only, from `IN PROGRESS 121` to a `DONE 121`
entry that states, in the row's own required order: (1) the objective was met
by the 29 August send, not by this row's run, with the artefact cited; (2)
the Chrome extension was never available to the relay, so the row was never
satisfiable as written in this environment; (3) a scripted browser was
deliberately not substituted, because the row forbade it and cycle 119
respected that. No second email sent, no tool search re-run, no other row,
no code, no schema, no client data, no allowlist change.

## Commit

`.bidlow/relay/QUEUE.md` (row 97 closeout, this cycle) and
`.bidlow/relay/log/cycle-120.md` (the watcher's own prior appendix, carried
forward since it was legitimate record left uncommitted by the previous
cycle, not new work) committed together via branch -> PR -> green CI ->
merge. Docs-only change; none of the three ask-first conditions apply
(no migration, no client data, no email sent).


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 121 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 02:08:52, took about 7.7 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/server/email/outbound/execute-one.ts, docs/ops/SEND-PROOF-2026-08-29.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 121 - queue item 97

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **PROVE IT IN A REAL BROWSER: A LIVE EMAIL, SENT THROUGH THE PRODUCT'S OWN SCREENS, THAT GREG CAN CHECK HIMSELF.** Greg asked for this directly on 29 August. The claim under test is one Cowork made and must now be made to stand up: that the system can send a live email, that the send is restricted to `bidlowai`, and that the restriction is enforced by code rather than by good intentions. **USE THE GOOGLE CHROME EXTENSION.** Drive the real product in a real browser - click the screens an operator clicks - not the API, not a script, not the queue worker invoked directly. **IF THE CHROME EXTENSION IS NOT AVAILABLE TO YOU, SAY SO IN YOUR LOG AND STOP.** Do not substitute an API call and describe it as a browser walk. A proof that quietly changes instrument is not a proof, and this project has recorded nine instances of exactly that shape. **THE SEND:** one email, from the `bidlowai` client, to `greg.visser64@gmail.com`. Greg will open his own inbox to check, so that address is the acceptance test and nothing else is. **THE RULES, NONE OF WHICH YOU MAY RELAX TO MAKE THIS WORK:** (1) `bidlowai` ONLY - the guard is evaluated per send in `src/server/email/outbound/execute-one.ts` around line 181, against the client slug via `resolveAutonomousRelayState`, and production `/api/health` currently reports `active: true` with `allowlistedClients: 1`. Do NOT disable it, do NOT widen `AUTONOMOUS_SEND_ALLOWLIST`, and do NOT set `autonomousSendEnabled` on any other client. If the guard REFUSES the send, that finding is worth more than the proof - write it down and stop. (2) ALIGNED DOMAIN OR NO LINK, absolute - a mismatch once got a client's mail quarantined. The 26 August proof kept every link and image on `bidlow.co.uk`; simplest here is a message carrying no links at all. (3) ONE email. Not a batch, not a sequence launch. **THE EVIDENCE, written to a dated artefact under `docs/ops/` in the shape of `SEND-PROOF-2026-08-26.md`:** which screens were clicked and in what order, screenshots from the browser, the sending mailbox, the UTC send time, the message's own Message-ID or provider id read back from the product, and the commit production was serving at the time - read from `/api/build-info` on the DIRECT App Service origin, never the custom domain, because production may still be stale (see row 96). **DEFINITION OF DONE, and it is not negotiable: the email is sitting in `greg.visser64@gmail.com`.** A 200 from a send call is not done. A database row saying SENT is not done. A green log is not done. If you cannot confirm arrival, mark this PARTIAL, say exactly how far it got and where the evidence stops, and leave the claim unproven rather than rounding it up. **STOP RETRYING THIS ROW - ITS PURPOSE IS ALREADY SERVED, AND ITS INSTRUMENT DOES NOT EXIST HERE.** Cycle 119 checked properly and refused to substitute: no interactive Chrome-extension tool is exposed to an unattended relay cycle, and this row also rules out the scripted-Playwright substitute that cycles 106, 109, 110, 111 and 112 used. That is a STANDING FACT about the relay's environment, not a transient miss - retrying it will produce the identical refusal every time and burn a cycle doing it. **THE ROW'S OWN DEFINITION OF DONE HAS BEEN MET BY OTHER MEANS.** It said: the email is sitting in greg.visser64@gmail.com, and that a 200 from a send call, a database row, or a green log would not count. That test is passed - a real email left the product at 22:45:54 UTC on 29 August for `bidlowai`, through the real Launch button on the real screens, with no bounce and Sent: 1 visible in the UI, and the owner confirmed receiving it in that inbox. Evidence: docs/ops/SEND-PROOF-2026-08-29.md. **CLOSE THIS ROW AS DONE**, and in the status say plainly, in this order: that the objective was met by the 29 August send rather than by this row's own run; that the Chrome extension was NEVER available to the relay and this row was therefore never satisfiable as written; and that a scripted browser was deliberately NOT substituted, because the row forbade it and cycle 119 respected that. Do not send a second email to prove a point already proven. Do not re-run the tool search.

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
  `DONE 121`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 121 - ...** |` reads correctly.
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

* Finished it -> `DONE 121 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 121 - <what is done, what is left>`. PARTIAL
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

Merged clean at `17e2676`. This was a docs-only, additive change — no code, no migration, no client data, no email sent.

**Cycle 121 summary:** PR sweep found zero open PRs. Row 97 in `QUEUE.md` had already been rewritten (uncommitted, by a prior process) to say its objective was satisfied by the 29 August real-browser send. I verified that claim against `docs/ops/SEND-PROOF-2026-08-29.md` before acting on it — confirmed a real email left `bidlowai` at 22:45:54 UTC on 29 August via the actual Launch button, no bounce, "Sent: 1" visible on screen, recipient inbox confirmed by Greg. Closed row 97 as `DONE 121`, stating in order: the objective was met by the 29 August send (not this run), the Chrome extension was never available to the relay, and a scripted-browser substitute was deliberately not used since the row forbade it. Committed alongside cycle 120's own previously-uncommitted watcher log, opened PR #414, watched CI green, merged and fast-forwarded `main` to `17e2676`.

