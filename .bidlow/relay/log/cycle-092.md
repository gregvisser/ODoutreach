# Cycle 92 — queue row 80, item 7: best message by job title

**Status: DONE 92.** Row 80's seventh and last item is built, gated, tested and
merged. All six earlier items were already shipped, so this closes the row.

## PR sweep, first

`gh pr list --state open` returned `[]`. Nothing open, nothing to merge, nothing
abandoned. The landfill the brief warns about is empty this cycle.

## What the item asked for, and what the data model would actually support

> (7) best-message-by-job-title

Three things about this application had to be checked before that question could
be answered honestly, and each one changed the shape of the answer. This is the
same kind of correction cycle 91 made to item 6, and for the same reason: the
queue row describes a feature from a generic outreach product, and this is not a
generic outreach product.

**The unit had to be a PERSON, not an email.** A contact enrolled in a campaign
receives five emails over about a month, and item 2 of this same row stops the
sequence the instant they reply. So counting sends would count one person up to
five times — inflating every z-score — and worse, the later steps' audience is
systematically stripped of exactly the people who reply. Comparing step 1's reply
rate against step 4's would have concluded that the first email is the best one,
whatever it said. One enrollment is now one row.

**"Message" had to mean the CAMPAIGN.** Templates and sequences are client-scoped
and every contact in a sequence walks the same steps, so the only copy dimension
that differs between two contacts of one client is which sequence they were
enrolled in. That is the only message comparison this schema can support.

**Job titles are free text and mostly ungroupable.** `Contact.title` is whatever a
CSV or RocketReach record held, so "VP of Operations", "Vice President,
Operations" and "V.P. Ops" are three buckets of one. `title-family.ts` groups
them by fixed rules in code — deliberately not by the model, because the grouping
decides who gets pooled with whom and a grouping that moved between runs would
move the arithmetic under it. Genuinely ambiguous titles ("Director", "Digital
Lead", "Compliance Officer") return `null` and are reported as coverage rather
than swept into an "Other" bucket that would be four unrelated jobs wearing one
name.

## The thing this feature has that the previous five did not

**Multiple comparisons.** The sender comparison compared about three mailboxes.
This compares every campaign inside every job-title family — easily dozens of
cells. At the conventional two-standard-error bar, one comparison in twenty
clears by chance, so a client with forty cells would have been handed roughly two
spurious "winners" on every press of the button, indistinguishable from real
ones. `bonferroniZThreshold` raises the bar in proportion to the number of
comparisons actually made, so the false-positive rate is controlled across the
whole table rather than one cell at a time. The inverse-normal CDF it needs is
Acklam's approximation, written out rather than added as a dependency — the same
call the two-proportion test made.

**A maturity window.** A campaign launched last week has not finished emailing
anyone, so its non-repliers are provisional. That is a systematic error with a
direction: the newest campaign always has the largest share of unfinished
enrollments, so comparing this month's campaign against one that finished in the
spring would have found the older one better every single time. Enrollments
newer than 35 days (day-25 final step, plus ten days for a reply) are excluded.

**Enrollments that never produced a sent email are not counted at all.** Somebody
excluded by suppression, or still PENDING, was never given the chance to reply.
Scoring them as a non-replier would have punished whichever campaign happened to
be pointed at a dirtier list.

## The confound that cannot be fixed, only declared

Nobody was randomised. Each campaign was aimed at a contact list an operator
built by hand, so a campaign that wins with Finance may simply have been given a
better list of Finance people. No amount of arithmetic removes this. It is stated
as fact in the system prompt, the tool REQUIRES alternatives on every finding
(the parser drops a finding that arrives with a single confident cause), and the
panel says it above the table — because by the time somebody has read the numbers
they have already formed the conclusion.

## The guardrail, which is a different one again

Cycle 88 refused the model a sequence's delays, 89 refused a critique replacement
copy, 90 refused the send schedule a field to write into, 91 refused any field
that could rate a person. This feature's danger is the most direct of the six: it
is read as an instruction to rewrite live copy. So the tool schema contains **no
field for suggested copy, a subject line, a rewrite, or a recommended change to
any campaign** — asserted directly against the schema in `title-message.test.ts`.
Draft text arriving with the authority of a statistic is one copy-paste from a
real send.

## Proving it fires, not that it exists

The brief's standing warning — six instances this week of something built, wired,
reporting success and never firing.

* **Red first, genuinely.** `title-family.test.ts` and
  `title-message-evidence.test.ts` both went RED on the first run. Two real
  failures, both in the tests: `normalizeTitle` over-asserted (`&` becomes "and"
  but `/` becomes a space, so `Health/Safety` legitimately differs as a string —
  what matters is that both classify the same, which is now what is asserted),
  and a regex looked for "could not be grouped" against a message that correctly
  reads "None of the job titles … could be grouped".
* **Mutation-tested the two controls that matter.** The server test was green on
  first run, which proves nothing, so the source was deliberately broken twice —
  the never-sent filter neutered, and the distinguishable-pair filter removed.
  Three tests went red, naming exactly the right behaviours. Both breaks reverted.
* **A round-trip test** (`title-message-roundtrip.test.ts`) runs the real
  grouping, the real evidence builder, the real significance test, the real
  request builder, the real HTTP layer and the real parser with only `fetch`
  faked — asserting that the tool schema we SEND and the shape we PARSE are the
  same agreement, and that our verdict actually reaches the model. It also proves
  three spellings of one job ("Operations Manager", "Head of Ops", "Operations
  Director") land in one audience of 1,600.

## A defect found and fixed on the way

The `${family.label} ${message.label}` lookup keys were written to disk with a
raw **NUL byte** where the space should have been. It worked (both sides matched)
but it made the file binary to `grep` and `git diff`. Replaced with
`pairKey(a, b)` = `JSON.stringify([a, b])`, which also closes a real if unlikely
collision: an audience "Finance" and a campaign "Finance — Q3" would collide
under any printable separator, and a collision there would let a finding about a
noise pair pass the filter wearing another pair's verdict.

## Gates — all run, all green

```
npm run typecheck   0 errors
npm run lint        0 errors, 0 warnings
npm test            344 files, 3578 tests passed
npm run build       webpack production build succeeded
```

New tests this cycle: 60 across five files.

## Migration — additive, and therefore mine to merge

`20260829200000_ai_title_message_fit`: one new enum value on `AiFeature` and one
new table `AiTitleMessageReview`. Nothing existing is dropped, altered, rewritten
or backfilled. Dropping what this adds restores today's behaviour exactly — no
code path outside the new panel reads either object, and the send pipeline, the
launch rail, enrolments and targeting do not and cannot. Same shape as the four
`AiFeature` additions cycles 88–91 merged.

## Metering, per the row's build requirement

The call goes through `runMeteredAiCall` with `feature: "TITLE_MESSAGE_FIT"`, so
model, tokens in, tokens out, cost, rate version and client are recorded on the
ledger as it happens — including when the model returns something unusable, since
the tokens were spent either way. The gate runs BEFORE the call, so a client whose
campaigns cannot be told apart costs nothing and produces no ledger row for a call
that never happened.

## What is still true and unchanged

The rate table is still flagged `RATES_VERIFIED = false`. Six cycles have now
failed to reach the published price list (WebFetch denied). Tokens — the part that
cannot be reconstructed later — are recorded correctly, so a corrected rate list
is a recompute rather than lost revenue. This remains an environment block, not a
code one.

`ANTHROPIC_API_KEY` is still absent from Azure, so this feature, like the other
six, is live and refusing. That refusal is correct and visible on its face.

## Open questions: 1

Should the AI features be given a key in Azure? All seven items of row 80 are now
built, gated and deployed, and all seven refuse at runtime for want of a key. That
is a money decision and a client-billing decision, so it is Greg's, not mine.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 92 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Started 2026-08-29 08:00:04, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\PHASE-2-SPEC.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 92 - queue item 80

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **AI FEATURES - THE HALF THAT NEEDS NO TRACKING. Spec: `C:\Bidlowbusiness\_odoutreach-handover\PHASE-2-SPEC.md`.** In this order of value: (1) reply classification - positive / interested later / referral / not interested / unsubscribe; (2) stop the sequence the instant someone replies; (3) AI writes a whole SEQUENCE (day 1, 4, 9, 16, 25) rather than one email; (4) campaign quality score and critique; (5) AI-chosen send times; (6) rep performance dashboard with AI explaining the differences; (7) best-message-by-job-title. Reply classification first - routing a "yes, happy to talk" to a human within minutes is worth more than every open-count feature on the owner's list combined. **METER THE AI SPEND PER CLIENT FROM THE FIRST COMMIT.** Greg is invoicing the owner for API usage. If model, tokens in, tokens out, cost and client are not recorded on every call as it happens, he cannot bill it and he eats the cost. Retrofitted metering always under-counts. This is a build requirement, not an afterthought. Every existing guardrail applies unchanged: an AI-drafted email is still an email, suppression is still checked at queue AND dispatch, caps and warm-up are still ceilings. *(Cycle 71: this row was numbered 42 in the second, header-less table that used to sit at the bottom of this file. Merging the tables gave it 80 so it would stop sharing a number with a different job.)* *(Cycle 91: a correction to this row's framing, not a change of scope. Item 6 says "rep performance dashboard". There is no rep in this data model — `mailboxIdentityId` is the only per-sender dimension on a send, sequences and templates are client-scoped so every sender sends identical words, and `resolveGovernedSendingMailboxFromRows` picks the primary connected mailbox rather than assigning prospects to people. So nobody here writes their own email, picks their recipients or sets their volume, and a gap between senders cannot mean what "rep performance" implies. Built as a comparison of MAILBOXES, with a significance test that refuses to explain a gap indistinguishable from chance. Item 7 is unaffected.)*

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
  `DONE 92`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 92 - ...** |` reads correctly.
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

* Finished it -> `DONE 92 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 92 - <what is done, what is left>`. PARTIAL
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


