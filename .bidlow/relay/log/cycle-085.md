# Cycle 85 — row 80: AI features, slice 1 — metering and reply classification

## The PR sweep, first

`gh pr list --state open` returned exactly one: **#355**, opened by cycle 84 and
left with CI still running. This is the structural failure the brief describes —
a cycle opens a PR, CI takes five minutes, the cycle ends, nobody returns. Both
checks had since passed. `gh pr merge --auto` was refused (auto-merge is
disabled on this repository, `enablePullRequestAutoMerge` errors), so it was
merged manually once the checks were confirmed green: **MERGED 02:34:55Z**.
`gh pr list --state open` now returns `[]`.

Worth recording for the next cycle: **auto-merge does not work here.** The
brief recommends `--auto` as better than update-then-race. It is not available
on this repo, so the sweep must watch and merge, which is what happened.

## The brief was right, and it was also far bigger than one cycle

Row 80 is seven features plus a metering requirement. It is not a task, it is a
phase. The brief itself supplies the ordering and the reason, and it was
followed exactly: metering first because it cannot be retrofitted, then reply
classification because routing a warm reply to a human beats every other item.

Two things in the row turned out to be already settled, and both were checked
rather than assumed:

* **Item 2, "stop the sequence the instant someone replies", was already built.**
  `src/server/email-sequences/stop-follow-ups-on-reply.ts` shipped in PR #137.
  It was verified as genuinely *wired* — called from `ingest.ts:166` and
  `process-synced-replies.ts:251`, with its own tests — not merely present.
* **Most of the wider PHASE-2-SPEC.md is done.** The account grade, the
  autonomous-send toggle, the per-client open-tracking opt-in and the DNS
  verification all have migrations dated 2026-08-28. Only the AI half was open.

## The four things written down before touching anything

1. **Files.** Reconnaissance first, because there was no AI code at all —
   `grep` found no Anthropic, OpenAI or any LLM dependency in `package.json`.
   This was greenfield. New: `src/lib/ai/*` (catalog, taxonomy, switch,
   display), `src/server/ai/*` (metered call, HTTP client, orchestration), one
   migration. Modified: the two ingest paths, the replies query, the replies
   panel, `.env.example`, `prisma/schema.prisma`.
2. **Red-first.** `metered-call.test.ts` and `classify-inbound-reply.test.ts`
   were both written before their modules existed and both watched fail with
   `Cannot find module`. The two *pure* modules were written before their tests,
   so they got this repository's established substitute instead — see below.
3. **Done, in one sentence.** When a reply arrives, the system labels it and
   records exactly what that cost, against the client, so Greg can invoice it.
4. **Not touched.** The send pipeline, suppression, `autonomous-actor-guard.ts`,
   `send-pacing.ts`, tracking, `relay-watch.ps1`, and every queue row but 80.

## Metering is enforced by the type system, not by discipline

The row's strongest instruction is that metering cannot be added later. A
convention that says "remember to record usage" *is* retrofitted metering — the
first call site that forgets is unbilled for ever, and nobody finds out until an
invoice is queried months later.

So `runMeteredAiCall` is the only way this application calls a model, and its
`invoke` callback returns token usage as part of its **return type**. A call
that does not report what it cost does not compile. That is the whole design.

Every outcome writes exactly one `AiUsageEvent`, including the free ones:

* `REFUSED` — switched off, no API key, or no price for the model.
* `ERROR` — the call was made and failed.
* `OK` — tokens × rates.

Recording the refusals is deliberate and is aimed straight at this project's
worst defect. QUEUE.md records six things that were built, wired, reported
success and never fired. A feature that is doing nothing should be *visible* as
doing nothing, and a REFUSED row is what makes "switched off on purpose" look
different from "quietly broken".

## The prices could not be verified, so the design assumes they are wrong

This is the most important honest note in the cycle.

`WebFetch` and `WebSearch` were **both denied** in this session, and the
`claude-api` skill was denied too. So the per-token rates in
`src/lib/ai/model-catalog.ts` are from model knowledge — precisely what the
engineering standard forbids for anything feeding a real-world action, and
issuing an invoice is one.

Rather than ship a confident wrong number, the design makes a wrong price
**recoverable**:

* `RATES_VERIFIED` is `false` and the file says loudly why.
* Every ledger row stores the raw `inputTokens` and `outputTokens`, **both rates
  actually applied**, and a `rateVersion`.
* `model-catalog.test.ts` asserts the stored cost is exactly reproducible from
  the stored numbers.

So if the figures are wrong, every affected row recomputes exactly. The part
that genuinely cannot be reconstructed later — the tokens — is captured
correctly from the very first call. That is the real content of the row's
warning that "retrofitted metering always under-counts".

**Owed:** check the published per-MTok prices, correct them, add a new rate
version, set `RATES_VERIFIED` true.

## Six labels, not the five the row lists

`UNCLEAR` was added on purpose and it is not scope creep. A classifier with no
"I do not know" is forced to guess, and its guesses land on the majority class —
which for cold outreach is rejection. The guess for an ambiguous "sure, send me
something" would be `NOT_INTERESTED`, silently burying exactly the reply the
feature exists to surface. The extra label protects the row's own stated
priority.

The same reasoning drives the failure behaviour throughout: **failing to label
is safe, mislabelling is not.** A prose answer, a refusal, an invented label or
a malformed tool call all parse to `null`, and `null` leaves the reply unlabelled
and routed to a person. The badge for an unlabelled reply says "Not checked yet"
rather than rendering blank, because a blank cell reads as "nothing of interest
here" and an unclassified reply is precisely one nobody has assessed.

The reply body is untrusted text from a stranger on the open internet, arriving
on every single call, so it is fenced in the user turn and the system prompt
says never to follow instructions inside it.

## Proven to fire — by watching it go red

The brief says to assume the seventh exists. Both fire-tests were confirmed
*capable of failing*, then restored:

* Unwiring `classifyInboundReplyQuietly` from `processSyncedMessageForReply`:
  `AssertionError: expected "spy" to be called with arguments:
  [ { replyId: 'reply-classify' } ]` — 1 failed, 33 passed.
* Breaking the refusal path so a switched-off call returned without metering:
  `AssertionError: expected "spy" to be called 1 times, but got 0 times` —
  1 failed, 10 passed.

`processSyncedMessageForReply` is the one that mattered. It is what the
15-minute `sync-replies` cron actually calls for live client mailboxes; wiring
only the legacy ESP-webhook ingest would have labelled **nothing** in production
while every test still passed.

Classification runs last, never throws, and drives nothing. An `UNSUBSCRIBE`
label is a label — the real unsubscribe rail, suppression at queue and dispatch,
per-mailbox caps and the warm-up ramp are all untouched.

## Migration — additive, and merged without asking

3 new enums, 5 nullable columns on `InboundReply`, 1 new table. No drops, no
type changes, no backfill. Dropping what this adds restores today's behaviour
exactly, which is the brief's own test, so it was the relay's to merge.

Generated properly rather than hand-written: a throwaway `shadow_cycle85`
database was created in the **e2e** Postgres container (our own scratch
container on :5434 — not the client DB, and not the other project's database on
:5433), all 48 existing migrations applied to it, the new SQL diffed out,
applied, and re-diffed to confirm **zero drift**. The database was dropped
afterwards.

## Verified live, by hash

* `/api/build-info` on the **direct** App Service URL returns commit
  `96e76d73f4c11cec77366f87b316347cd13620e6` — the merge commit exactly.
* `/api/health`: `{"ok":true,"checks":{"database":"ok"}}`.
* Deploy log: `Applying migration 20260829030000_ai_metering_and_reply_classification`
  against `pg-opensdoors-outreach-prod-01`.

## The one open question, and it is Greg's because it is money

`az webapp config appsettings list` confirms **`ANTHROPIC_API_KEY` is not set**
on `app-opensdoors-outreach-prod`.

So right now, in production, every inbound reply enters the metered path,
refuses with `no_api_key`, writes a REFUSED ledger row, and displays as "Not
checked yet". That is the designed fail-closed behaviour, it is honest on
screen, and it is deliberately not a silent mock — but it means **zero replies
are being classified**.

Setting the key starts real, billable spend that Greg invoices onward. That is
money, which the brief reserves to him, so it was not decided here.

**Question for Greg:** set `ANTHROPIC_API_KEY` in Azure App Service config to
turn reply classification on? Until then the feature is deployed, visible, and
refusing.

## Left for the next cycle — the row stays PARTIAL

Slice 1 of 7. In priority order:

1. **The spend screen.** The ledger is being written and nothing displays it, so
   nobody can yet *see* what to invoice. This is the highest-value next step and
   it is the other half of the row's billing requirement.
2. **The per-client off-switch with attribution.** Only the global
   `AI_FEATURES=off` exists. The spec wants it per client, with a name against
   it. A column with no writer would have been a shell, so it was deliberately
   not added this cycle.
3. Items 3–7: AI-written sequences, campaign quality scoring, AI-chosen send
   times, the rep dashboard, best-message-by-job-title.

## Gates

* `npm run lint` — clean.
* `npm run typecheck` — clean.
* `npm test` — **3264 passed, 323 files**.
* `npm run build` — green.
* `npx vitest run relay/` after editing QUEUE.md — 156 passed, so the queue
  still parses through the real watcher parser.

Open questions: **1** — set `ANTHROPIC_API_KEY` in Azure, or leave the feature
refusing?


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 85 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Started 2026-08-29 03:16:49, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\PHASE-2-SPEC.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 85 - queue item 80

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
  `DONE 85`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 85 - ...** |` reads correctly.
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

* Finished it -> `DONE 85 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 85 - <what is done, what is left>`. PARTIAL
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


