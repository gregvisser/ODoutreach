# Cycle 122 - queue item 93

## First: the PR sweep

`gh pr list --state open` returned zero open PRs at cycle start. Nothing to
merge, nothing to comment on.

## What was found on disk before touching anything

`git status` at session start showed uncommitted modifications to
`.bidlow/relay/QUEUE.md` (row 93's status cell already flipped from `TODO` to
`IN PROGRESS 122` - the picker's own dispatch marking) and
`.bidlow/relay/log/cycle-121.md` (176 lines added - the watcher's own
automatic end-of-cycle appendix for cycle 121, never committed), plus the
same untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` that cycles 120 and 121
both found and correctly left alone as unrelated to any row. This matches the
exact shape cycle 121's own log described finding from cycle 120 - legitimate
prior record left uncommitted, not stray work - so it is carried forward in
this cycle's commit rather than discarded or redone.

## The four things, written down before acting

1. **Files to change:** `.bidlow/GRADES.json` (dimension 8's scorecard entry,
   the blockers list, and `questions_for_greg` - nothing else in that file),
   `.bidlow/relay/QUEUE.md` (row 93's status cell), and this log. The
   already-present uncommitted `cycle-121.md` appendix travels in the same
   commit as legitimate prior record.
2. **Red-first test:** does not apply in the usual sense - this is a grading
   task, not new code, and there is nothing to make go red. The substitute is
   re-running the same live-client mechanism CR-06's original evidence used
   (`sentry-config-wiring.test.ts` / `sentry-data-collection.test.ts`) fresh
   today rather than citing the old result, and independently verifying a
   fact (whether `ANTHROPIC_API_KEY` is live in production) rather than
   trusting a memory note that said it was absent.
3. **Done looks like:** dimension 8's entry states plainly whether 6 was fair
   when set on 27 August, states a new score with fresh evidence rather than
   re-citing CR-06/CR-05's closure text, and no other dimension, the
   arithmetic, the weighted total or the sell gate changes.
4. **Not touched:** engineering section, any other customer-ready dimension,
   `arithmetic`, `weighted_total`, `sell_gate` (all three explicitly reserved
   for row 94), any code, any migration, any client data, any email.

## Answering Greg's question first

Was 6 fair on 27 August? Yes. Checked both named inputs' actual merge/sign
dates against the 27 August walk date: CR-06's fix is commit `47692b9`,
authored 2026-08-28 09:43 (the day after); CR-05's Sentry DPA was signed
2026-08-28 per its own evidence text. Neither existed on 27 August, so the
walk that set the 6 could not have seen either fix - it was measuring a real,
uncovered leak that genuinely existed that day. This is recorded as a score
that went stale, not one that was wrong, per the row's own distinction.

## Re-measuring, not re-reading

Confirmed production is running commit `062e21e` (via
`curl https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info`,
the direct App Service origin) and that `47692b9` (CR-06's fix) is an
ancestor of it (`git merge-base --is-ancestor`).

Re-ran, today, the same mechanism CR-06's original evidence used rather than
citing that evidence: `npx vitest run src/lib/monitoring/sentry-config-wiring.test.ts
src/lib/monitoring/sentry-data-collection.test.ts` - 16/16 green, including
the assertion that reads `userInfo`/`httpBodies` back off a real,
initialised `Sentry.init()` client as `false`. Grepped all three entry points
(`sentry.server.config.ts`, `sentry.edge.config.ts`,
`src/instrumentation-client.ts`) and confirmed all three still wire the same
shared `SENTRY_DATA_COLLECTION` policy - no drift since the fix. Also
confirmed via `git log --since=2026-08-28` that none of those files have
changed since. This is genuine re-measurement: the test was executed fresh
against the current tree, not read as a past result.

## Checking for a new carrier, as instructed

Searched for anything that has begun sending prospect data to a third party
since the 27 August walk. Found: six AI features (`src/server/ai/*`, queue
row 80) merged 2026-08-28/29 (after both CR-06 and CR-05), all of which call
Anthropic's Messages API via `src/server/ai/anthropic-messages.ts`
(`POST https://api.anthropic.com/v1/messages`). Read each of the six:

- `classify-inbound-reply.ts` sends a real prospect's subject line plus up to
  2,000 characters of their actual reply body, verbatim, to Anthropic - a
  genuine carrier of "message bodies" in the row's own language, and
  potentially of a name or address a stranger signed the reply with.
- `explain-rep-performance.ts` sends only the CLIENT's own sending-mailbox
  display name/address and aggregate send/reply/bounce counts - not a
  prospect's data.
- `advise-title-messages.ts` sends only an aggregated job-title bucket
  (`contact.title`), not a name, address or individual message.
- `review-campaign.ts`, `draft-sequence.ts` and `advise-send-times.ts`
  operate on the client's own template copy and aggregated statistics.

So exactly one of the six is a genuine prospect-PII carrier by the row's own
test. No Art.28 DPA exists for Anthropic - CR-05 covered only Sentry, Resend
and RocketReach.

Checked whether this pathway has actually fired, live rather than assumed:
`az webapp config appsettings list --name app-opensdoors-outreach-prod
--resource-group rg-opensdoors-outreach-prod` (az cli confirmed authenticated
first) lists all 38 real app settings by name; `ANTHROPIC_API_KEY` is not
among them. Read `src/server/ai/metered-call.ts`, which all six AI features
route through with no other path to Anthropic, and confirmed
`if (!apiKey) return refuse("no_api_key")` runs before any network call.
Grepped all six feature files and confirmed each passes
`apiKey: process.env.ANTHROPIC_API_KEY` into that same gate - no feature
bypasses it. So the pathway is real in the deployed code and currently inert,
confirmed by measuring the actual production configuration rather than
trusting the memory note that said so.

## The score

7, not held at 6, not moved to 8. Up because the two causes of the 6 are now
genuinely fixed and were freshly re-verified this cycle, not merely cited as
closed. Not to 8 because this pass surfaced something the 27 August walk
could not have seen: a live, deployed pathway that would carry a real
prospect's message text to an uncovered fourth third party the moment one
environment variable is set, gated by nothing that checks for a DPA - only by
an absent key. That is the same "built, wired, would fire" shape this
project keeps finding, currently facing the safe direction by accident of
configuration rather than by design.

## What was written

`.bidlow/GRADES.json`: dimension 8's scorecard entry rewritten with the above
(score 6 -> 7); a new blocker `CR-10` (status OPEN, owner `greg`) recording
the Anthropic finding and the two possible fixes (a DPA, or a code-level
compliance gate); `questions_for_greg` gained one entry for CR-10, and
`open_questions` moved from 1 to 2. Diffed the file before committing to
confirm ONLY dimension 8, the blockers array and `questions_for_greg`
changed - `engineering`, every other scorecard dimension, `arithmetic`,
`weighted_total` (still 7.76) and `sell_gate` are byte-identical to before
this cycle, confirmed with `node -e` reading the JSON back and with a
grep over the diff for `"n":`/`"dimension":` occurrences (only n:8 appears).

`.bidlow/relay/QUEUE.md`: row 93's status cell only, from `IN PROGRESS 122`
to a `DONE 122` entry stating the fair-when-set answer, the fresh
measurement, the CR-10 finding, and the new score, in that order.

## Gates

`npm run lint` -> 0 errors. `npm run typecheck` -> 0 errors.
`npm test` -> 348 files, 3649/3649 tests green.

## Commit

`.bidlow/GRADES.json`, `.bidlow/relay/QUEUE.md`, `.bidlow/relay/log/cycle-121.md`
(carried forward, previous cycle's own record) and this log, committed
together via branch -> PR -> green CI -> merge. Docs/data-record-only
change; none of the three ask-first conditions apply (no migration, no
client data touched, no email sent).


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 122 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 02:17:33, took about 21.3 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 122 - queue item 93

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **RE-MEASURE DATA SAFETY FROM EVIDENCE, AND SAY WHETHER THE 6 WAS FAIR WHEN IT WAS SET.** `.bidlow/GRADES.json` dimension 8 (Data safety and trust, weight 10, score 6) carries its own instruction: re-grade on the next walk, where the remaining input is the CR-05 DPA question. Both of its named inputs have since closed, and BOTH closed AFTER the 27 August walk that set the 6 - CR-06 on 28 August (the permissive Sentry dataCollection block replaced by one explicit policy, proven by reading userInfo false back off a live client) and CR-05 on 28 August (Sentry DPA v5.1.0 accepted, EU storage region, green tick on the org legal page). **FIRST, ANSWER THE QUESTION GREG ASKED: was 6 the right number on 27 August, given what was true on 27 August?** If it was, say so in the GRADES.json entry. A score that was FAIR WHEN SET and has since gone stale is a different thing from a score that was WRONG, and the record should let a reader tell them apart. **THEN RE-MEASURE, DO NOT RE-READ.** Closing a cause is not observing the effect: confirm on the DEPLOYED build that prospect personal data is not leaving the building - resolve the options off the live client again - and check whether anything OTHER than Sentry has begun carrying names, addresses or message bodies to a third party since. **Score what you measure.** If the honest answer is that it stays at 6, or moves to 7 rather than 8, that is the answer and you write it down with the evidence. **DO NOT TOUCH ANY OTHER DIMENSION, AND DO NOT CLOSE ANYTHING TO MAKE A NUMBER MOVE.**

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
  `DONE 122`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 122 - ...** |` reads correctly.
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

* Finished it -> `DONE 122 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 122 - <what is done, what is left>`. PARTIAL
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

`.bidlow/STATE.md` is updated and merged (`main` now at `44f052e`), recording what this session did, the CR-10 finding for Greg, and what row 94 needs to pick up next.

