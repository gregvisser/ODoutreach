# Cycle 91 — queue item 80, sub-item 6: comparing the senders

**Shipped:** PR #367 — `feat(ai): compare a client's sending mailboxes, refusing
to explain noise`.

## The PR sweep

`gh pr list --state open` returned `[]`. Nothing to merge, nothing abandoned.
Cycle 90 closed its own PRs (#364, #365, #366) before ending, which is the
behaviour the standing instruction is trying to produce.

## What I found before writing anything, and why it changed the build

The queue asks for a "rep performance dashboard with AI explaining the
differences". Two facts about this application had to be checked before that
could be built honestly. Both were checked against the schema and the send code,
not assumed, and both changed what the screen is allowed to claim.

**A "rep" in this product is a MAILBOX, not a salesperson.** `mailboxIdentityId`
is the only per-sender dimension anywhere on a send. It appears on outbound mail,
a per-mailbox sync cursor and a send-quota ledger — and on nothing that holds
copy. There is no rep, no owner, no territory, no assignment of prospects to
people anywhere in the data model.

**Nobody here writes their own email, chooses their recipients, or sets their
volume.** Sequences and templates are client-scoped, so every sender in a
workspace sends identical words. And the mailbox is not picked per prospect:
`resolveGovernedSendingMailboxFromRows` (src/server/mailbox/sending-policy.ts:157)
takes the primary connected mailbox, or the first connected one that can send. So
volume differences are an artefact of which mailbox is flagged primary and which
were connected that week, and each sender's audience is whatever happened to be
queued while their mailbox was the available one.

The consequence is direct: **a difference between senders in this product cannot
mean "this person writes better email" — the words are identical — and it cannot
mean "this person works harder", because no human chose the volume.** What it can
legitimately mean is that one MAILBOX's mail is arriving and another's is not:
broken authentication, a reputation hole, an unfinished warm-up, a dead token.
That is a real and expensive problem for this client — only 27 of 55 live
mailboxes could send when it was last measured — and it is what I built.

I did not narrow the item to avoid it. I built the comparison the row asked for,
across every sender, with the AI explaining the differences. I framed it as a
comparison of mailboxes because that is what the data supports, and the panel
says so in its first two sentences.

## The thing this feature is really guarding against

A table of named colleagues sorted by reply rate is evidence in a performance
conversation whatever the heading says. Cold-outreach reply rates are low single
digits, so on the volumes a capped mailbox achieves, one sender on 8% and another
on 4% is the overwhelmingly likely outcome of **two senders who are exactly the
same**. A screen printing those two numbers next to two people's names, under a
fluent AI paragraph explaining the gap, manufactures a performance problem out of
a coin toss.

So the arithmetic decides which gaps are real before the model is asked to
explain anything. `compareRateToPool` is a two-proportion z-test of each sender
against every other pooled, threshold |z| ≥ 2. Written out in six lines rather
than pulled from a statistics package — a dependency on a billing-adjacent screen
has to earn itself. Replies and bounces are tested **separately**, because a
mailbox bouncing far more than its peers is a deliverability fault, and folding
that into one "performance" verdict is how somebody gets sent to a coaching
conversation about a broken DNS record.

Three layers enforce that rather than request it, because a prompt is advice and
only structure is a control:

1. **The tool schema has no field for a score, rating, rank, grade or any action
   about a person.** A `rating` column would be read as a judgement this
   application had made about an employee, on data that cannot support one. The
   test asserts against the *schema*, not a response — a field that exists will
   eventually be filled; one never defined cannot be.
2. **The parser drops a finding that offers a single confident cause.** The
   prompt asks for alternatives; if they do not arrive the finding goes, because
   a lone cause attached to a named person's mailbox reads as a diagnosis.
3. **The server drops any finding naming a sender our own arithmetic marked as
   within normal variation.** This is the only guard that survives the model
   ignoring every instruction it was given.

The model is also told four facts it cannot know and would otherwise get badly
wrong — same words, no choice of recipients, no choice of volume, a sender is a
mailbox. Without them the fluent, plausible, completely false answer is "Alex
writes better subject lines".

## Metering

Per the row's standing requirement, metered from the first commit rather than
after. The call goes through `runMeteredAiCall`, so model, tokens in, tokens out,
cost and client land on the ledger as `REP_PERFORMANCE` — including refusals,
which is how "off on purpose" stays visibly different from "silently stopped
working". A client with too little sending is refused **before** any money is
spent and before anything is written about anybody.

## Proving it fires, not that it exists

The brief's standing demand, and the defect this project is worst at.

* **Red first, watched.** `rep-performance-evidence.test.ts` was written and run
  before the module existed — `Cannot find module './rep-performance-evidence'`.
  Its central assertion is that a 4%-versus-8% gap on 150 sends each is reported
  `indistinguishable`.
* **The new server drop-guard was proven capable of failing.** I replaced the
  filter with `const findings = parsed.findings` and re-ran: exactly the two
  tests that cover it went red (`expected [ { …(4) } ] to have a length of +0 but
  got 1`), the other eleven stayed green. Restored, 13/13 green.
* **A round-trip test** runs the real evidence builder, real significance test,
  real request builder, real HTTP layer and real parser with only `fetch` faked —
  and asserts the significance verdict actually reaches the prompt. That line
  could be deleted today and every other test in the feature would stay green.

## Gates — all four run, output seen

```
npm run lint       clean
npm run typecheck  clean
npm test           3518 passed across 339 files
npm run build      ✓ Compiled successfully in 30.5s
```

(The build prints `GlobalBrandSetting` auth errors from local Postgres. That is
the documented local DB drift, not a build failure — the build reports success
and the page falls back to defaults.)

## Schema — additive, so mine to merge

One new enum value (`AiFeature.REP_PERFORMANCE`) and one new table
(`AiRepPerformanceReview`). Nothing existing is dropped, altered, rewritten or
backfilled; dropping what this adds restores today's behaviour exactly. Nothing
outside the new panel reads either object — the send pipeline and the mailbox
rows are untouched, asserted by a test that fails if this ever grows a route to
a mailbox row.

`PRODUCTION_PRISMA_MIGRATE` is true, so merging applies it to the live database.
That is expected and sanctioned for an additive migration.

## Nothing was sent

No email left the building for any client. The feature reads history and writes
prose; it has no route to the send pipeline.

## Where item 80 now stands

Done: (1) reply classification, (2) stop on reply, (3) AI-written sequences,
(4) campaign quality score, (5) AI-chosen send times, (6) this.

**Left: (7) best-message-by-job-title.** The row stays `PARTIAL` so the next
cycle picks it straight back up.

## One thing for Greg, unchanged from four cycles ago

`ANTHROPIC_API_KEY` is still not set in Azure. Every AI feature — classification,
drafting, review, send-time advice, and now this — is live, wired and
**refusing**, visibly, on the ledger. Nothing is broken; nothing has been
switched on. Setting that key is the moment these start costing money, and it is
your call, not mine.

The model prices in `model-catalog.ts` are still flagged
`2026-08-29-unverified` — entered from model knowledge because WebFetch was
denied, now across five cycles. The tokens are recorded correctly, so any wrong
rate is a recomputation rather than lost revenue, and `/settings/ai-spend` says
so on its face. It still wants a human to check the published prices before an
invoice goes out.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 91 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 07:24:00, took about 35.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\PHASE-2-SPEC.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 91 - queue item 80

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **AI FEATURES - THE HALF THAT NEEDS NO TRACKING. Spec: `C:\Bidlowbusiness\_odoutreach-handover\PHASE-2-SPEC.md`.** In this order of value: (1) reply classification - positive / interested later / referral / not interested / unsubscribe; (2) stop the sequence the instant someone replies; (3) AI writes a whole SEQUENCE (day 1, 4, 9, 16, 25) rather than one email; (4) campaign quality score and critique; (5) AI-chosen send times; (6) rep performance dashboard with AI explaining the differences; (7) best-message-by-job-title. Reply classification first - routing a "yes, happy to talk" to a human within minutes is worth more than every open-count feature on the owner's list combined. **METER THE AI SPEND PER CLIENT FROM THE FIRST COMMIT.** Greg is invoicing the owner for API usage. If model, tokens in, tokens out, cost and client are not recorded on every call as it happens, he cannot bill it and he eats the cost. Retrofitted metering always under-counts. This is a build requirement, not an afterthought. Every existing guardrail applies unchanged: an AI-drafted email is still an email, suppression is still checked at queue AND dispatch, caps and warm-up are still ceilings. *(Cycle 71: this row was numbered 42 in the second, header-less table that used to sit at the bottom of this file. Merging the tables gave it 80 so it would stop sharing a number with a different job.)*

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
  `DONE 91`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 91 - ...** |` reads correctly.
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

* Finished it -> `DONE 91 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 91 - <what is done, what is left>`. PARTIAL
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

Cycle 91 complete and verified in production.

## What shipped

**Item 6 of queue row 80** — merged as `991013c`, deployed, and confirmed running by hash on the direct App Service URL (`/api/build-info` → `991013c3340f...`). Health `ok`, database `ok`. The additive migration applied via the deploy's `Prisma migrate deploy` step. No open PRs remain.

## The finding that changed the build

The row asks for a "rep performance dashboard". **There is no rep in this data model**, and I checked rather than assumed:

- `mailboxIdentityId` is the only per-sender dimension on a send, and in the schema it touches outbound mail, a sync cursor and a quota ledger — never anything holding copy.
- Sequences and templates are client-scoped, so **every sender in a workspace sends identical words**.
- `resolveGovernedSendingMailboxFromRows` picks the primary connected mailbox, or the first that can send. It does not assign prospects to people.

So nobody here writes their own email, picks their recipients, or sets their volume. A gap between senders cannot mean "this person is worse" — it means one *mailbox's* mail is arriving and another's is not. On a client where 27 of 55 mailboxes could send when last measured, that is the useful reading. I built the full comparison the row asked for and framed it as mailboxes; the queue row now records the correction rather than hiding it.

## The guard that matters

A table of named colleagues sorted by reply rate is evidence in a performance conversation whatever the heading says — and at these reply rates, 4% vs 8% on 150 sends each is z≈1.46, i.e. a coin toss. So a two-proportion z-test runs **before** the model is called, and the model may only explain gaps that survive it. Three structural layers, because a prompt is not a control: the tool schema has no score/rank/action-about-a-person field; the parser drops a finding offering one confident cause; the server drops any finding naming a sender the arithmetic marked "within normal variation".

## Gates — all run, output seen

`lint` clean · `typecheck` clean · **3,518 tests across 339 files** · build compiled · CI `verify` + E2E both green.

Proving it fires rather than exists: the evidence test was watched failing before its module existed, and I deliberately removed the server drop-guard — exactly its two covering tests went red, the other eleven stayed green — then restored it.

## Two things that are yours, not mine

1. **`ANTHROPIC_API_KEY` is still unset in Azure.** All six features are live, wired, and visibly *refusing* on the ledger. Nothing is broken; nothing has been switched on. Setting that key is when this starts costing money.
2. **Model prices remain flagged unverified after five cycles** — WebFetch has been denied every time, so this is an environment block, not a to-do. Tokens are recorded correctly, so a wrong rate recomputes rather than losing revenue, but it needs a human with a browser before an invoice goes out.

Row 80 is `PARTIAL 91`. **One item left: (7) best-message-by-job-title.**

**Open questions: 1** — do you want the AI features switched on in Azure, or should they keep refusing until the prices are verified?

