# Cycle 89 — queue item 80

## What it did

Shipped the fifth slice of row 80: **item (4), "campaign quality score and
critique".** One button per campaign on a client's Outreach tab reads every
email in that sequence and returns a score out of 100 plus a short critique of
what to tighten before it goes out, with the cost on that client's ledger. Row
80 stays `PARTIAL 89`: items 5–7 are untouched and the token prices are still
unverified.

## PR sweep

`gh pr list --state open` returned **nothing**. Cycle 88 left the board clean
and this cycle inherited it. Nothing to merge, nothing to comment on.

## The thing I found before building, which is the point of this cycle

**The launch readiness rail is where this feature would have gone wrong, and it
would have gone wrong in two opposite directions at once.**

`evaluateSequenceLaunchReadiness` (`src/lib/email-sequences/launch-readiness.ts`)
produces the `canLaunch` that gates the send button. It is a list of twelve
deterministic, offline checks. A "campaign quality score" is, on its face,
exactly the kind of thing that belongs in that list — and adding it there is
the obvious implementation.

It is also a production outage and a safety defect, together:

* **As a blocker**, it would stop every launch in the product whenever the AI
  was unavailable. That is not a hypothetical edge case, it is *today*:
  `ANTHROPIC_API_KEY` is unset in Azure, so every AI call in this application
  currently REFUSES. A quality check wired in as a blocker would have taken the
  live client's send button out on deploy, for every campaign, immediately.
* **As a pass**, it would print a machine's opinion in the visual language of
  the safety checks, next to the one button that mails strangers from a real
  client's sending domain. An operator reading a green "Campaign quality" row
  alongside "Unsubscribe & compliance" and "Sending mailbox has a signature"
  reads *checked*.

Both failures come from the same wire, so the wire does not exist. The rail is
untouched. Four assertions were added to `launch-readiness.test.ts`: no check
id, no display-order entry, and no operator-visible label or detail mentions an
AI score, plus one proving the rail reaches its verdict from a snapshot that
has nowhere to put one.

**Writing that guard caught a bug in the guard itself, which is the argument
for running tests rather than reasoning about them.** The first version matched
`/ai|score|quality/i` against the raw check id and went red on two existing
checks — `daily_capacity_av`**`ai`**`lable` and `pending_em`**`ai`**`l_sendable_recipients`.
A guardrail that fires on innocent code gets deleted for being wrong instead of
respected for being right, so it now splits the id on `_` and matches whole
segments, with a test proving the matcher still catches `ai_quality_score` and
`campaign_review` while leaving `daily_capacity_available` alone.

## The second safety decision: a critique cannot carry an email

Same shape as cycle 88's "the model writes words, not schedules". A finding's
`suggestion` is capped at **240 characters, in the parser, not in the view**.

A review that could return replacement copy would be a second way to author
outreach text — one that never passes the placeholder allowlist, the
signature-token strip or the length caps that `sequence-drafting.ts` applies to
model output, and that a person could paste straight into a template. The
system prompt also says "describe the change, do not write the replacement
email", but the prompt is advice and the cap is structure.

The tool schema additionally has **no field in which the model can say a
campaign is approved, cleared, safe or ready to send**, asserted by a test that
greps the serialised schema for those words. And no score band is worded as
permission: the labels describe the writing ("Strong writing", "Needs work
before it goes out"), never the send decision.

## Red-first

**`src/lib/ai/campaign-review.test.ts` — 30 tests, watched against a
deliberately naive stub: 20 FAILED, 10 passed.** The 10 that passed are the
negative assertions a null-returning parser and an empty schema satisfy for
free ("returns null for a non-array", "the schema contains no forbidden word"),
which is what proves the 20 positive claims were not vacuous. Same pattern
cycles 87 and 88 recorded.

**`src/server/ai/review-campaign.test.ts` was proved capable of failing by
deliberately breaking the code**, since it starts green. Two breaks at once:
adding a `clientEmailTemplate.updateMany` that "applies" the review, and
dropping `clientId` from the sequence lookup. Result:

```
× changes nothing about the campaign it reviews
× scopes the read to the paying client, so one tenant cannot bill for another's copy
Tests  2 failed | 16 passed (18)
```

Reverted; the restored file was re-run green and `grep` confirms the scoping
line is back and no `updateMany` remains.

## Proving it fires, not that it exists

The row's standing warning is that this project has shipped six things that
were built, wired, reported success and never fired. The two test files above
share one blind spot: `review-campaign.test.ts` mocks `callAnthropicMessages`,
and `campaign-review.test.ts` hands the parser a hand-written block. **Nothing
asserted that the tool schema we SEND and the shape we PARSE are the same
agreement** — a drift on one side would leave every test green and the feature
dead in production.

`src/server/ai/campaign-review-roundtrip.test.ts` closes that: the real request
builder, through the real HTTP layer, into the real parser, with only `fetch`
faked. It asserts the outgoing body actually carries the forced `tool_choice`,
the fenced `<campaign>` and the real copy, that the token counts that become
the bill survive the trip, and that a refusal turn parses as *no review* rather
than as a zero score — because 0/100 renders as "Weak — rewrite before
sending" on a campaign nobody reviewed.

This cannot call the real API and does not pretend to: there is no key, and a
test that spent money would be a bad test. Every layer we own is proved
consistent; the only untested link left is Anthropic's own. The test also
failed for real once while being written (a case-sensitivity slip on the
system-prompt assertion), which is direct evidence it inspects the real request
rather than passing vacuously.

## What "done" looks like

Staff open a client's Outreach tab, press one button on a campaign, and get a
score out of 100 and a plain-English list of what to fix in the emails —
advice that changes no email and does not affect whether the campaign can be
launched, with the cost on that client's bill.

## Gates

* `npm run lint` — clean (exit 0).
* `npm run typecheck` — clean.
* `npm test` — **3403 passed, 331 files** (up from 3400 / 330 on the merge base).
* `npm run build` — green.
* `npx prisma validate` — valid; `CAMPAIGN_REVIEW` and `AiCampaignReview`
  present in the generated client.

One flake seen and worth recording: `sentry` DSN test failed on the first full
run and passed on re-run. It resolves a deliberately non-existent host, so it
is network-dependent and unrelated to this change.

## The migration, and why I merged it myself

`20260829090000_ai_campaign_review` adds one enum value
(`ALTER TYPE "AiFeature" ADD VALUE 'CAMPAIGN_REVIEW'`) and creates one new
table (`AiCampaignReview`) with three foreign keys onto it.

The brief names both as ADDITIVE and mine: *"Creating a NEW table, a new enum,
or adding foreign keys to a new table is ADDITIVE and is yours to merge."* Its
stated test — does dropping what this adds restore today's behaviour exactly? —
is satisfied: no existing table, column or type is dropped, altered, rewritten
or backfilled, and no code path outside the new panel reads either object.
Cycle 88 recorded the same reasoning for the same `ALTER TYPE` shape.

`ALTER TYPE ... ADD VALUE` is transaction-safe on PostgreSQL 12+ provided the
new value is not USED in the same transaction. It is not: the first row
carrying it is written by application code long after the migration commits.

No client data is moved, and no email can be sent by any path this adds.

## STILL OPEN — and (a) has not moved in FIVE cycles

**(a) The per-token prices are STILL unverified. This is an ENVIRONMENT BLOCK.**
The `claude-api` skill was denied again this cycle, making five consecutive
cycles (85, 86, 87, 88, 89) in which WebFetch, WebSearch and that skill have
all been unavailable. Cycle 88 additionally established there is no local
pricing reference on this machine. I made **one** attempt and then stopped
rather than spend a sixth cycle rediscovering the same wall.

Everything downstream still survives it correctly: every `AiUsageEvent` stores
raw `inputTokens`, `outputTokens`, both applied rates and the `rateVersion`, so
a wrong rate is a recompute and not lost revenue; `/settings/ai-spend` says on
its face that the figures are unverified. **What is missing is two minutes with
a browser on docs.claude.com.**

This cycle again deliberately did NOT introduce a second unverified price:
campaign review reuses the one model already in the rate table.

**(b) `ANTHROPIC_API_KEY` is still unset in Azure.** So in production this panel
renders and honestly says "The AI is not configured on this environment yet"
rather than offering a control that fails on click. Nothing is charged and
nothing is reviewed until the key is set. Setting it is Greg's call because it
starts real spend against a real invoice.

**(c) Items 5–7 untouched:** AI-chosen send times, rep performance dashboard,
best-message-by-job-title.

## Open questions for Greg: 2

1. **Verify the token prices** (two minutes, docs.claude.com). Five cycles
   blocked; nothing else unblocks the invoice.
2. **Set `ANTHROPIC_API_KEY` in Azure** when you want the AI features to start
   costing money — until then classification, drafting and review all refuse,
   visibly and on the ledger.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 89 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 06:05:50, took about 37.3 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\PHASE-2-SPEC.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 89 - queue item 80

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
  `DONE 89`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 89 - ...** |` reads correctly.
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

* Finished it -> `DONE 89 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 89 - <what is done, what is left>`. PARTIAL
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

Cycle 89 complete. Board clean, tree clean, shipped and live.

## What I built

**Item (4) of row 80 — campaign quality score and critique.** One button per campaign on a client's Outreach tab reads every email in the sequence and returns a score out of 100 plus a plain-English critique of what to tighten, metered to that client's ledger. Row 80 is now `PARTIAL 89` (items 1–4 of 7 done).

## The thing worth your attention

The obvious place to put a "campaign quality score" is the launch-readiness rail — the twelve checks that gate the send button. **That would have broken the product in both directions at once.**

As a *blocker*, it stops every launch whenever the AI is unavailable — which is right now, because `ANTHROPIC_API_KEY` is unset, so every AI call refuses. It would have removed the live client's send button on deploy. As a *pass*, it prints a machine's opinion in the same visual language as "Unsubscribe & compliance", next to the button that mails strangers from a real client's domain.

Both failures come from the same wire, so the wire doesn't exist. The rail is untouched and four assertions now pin that down. Writing that guard caught a bug in the guard itself: my first regex matched `daily_capacity_av`**ai**`lable` and `pending_em`**ai**`l_sendable_recipients` and went red on innocent code — a guardrail that false-fires gets deleted rather than respected, so it now matches whole segments.

Second guardrail, same shape as cycle 88's "no delay field": a finding's suggestion is capped at 240 characters **in the parser, not the view**, so a "review" can never become a second way to author email copy that bypasses the placeholder allowlist and length caps.

## Evidence

- Red-first: 30 tests watched fail **20/10** against a naive stub; server tests proved failable by deliberately breaking tenant scoping and adding a template write, then reverted and re-verified.
- Gates: lint clean, typecheck clean, **3403 tests / 331 files** (from 3400/330), build green.
- CI green, merged as `ee916aa`, deployed. Production migrate step ran green; `/api/build-info` on the **direct** App Service URL returns `ee916aab67a9c8bac083047465dba86b5c422a4d`; health reports `database: ok`.
- One flake recorded honestly: a Sentry DSN test resolving a deliberately non-existent host failed once, passed on re-run — network-dependent, unrelated.

I added a round-trip test because the other two test files both mock across the send/parse seam — a drift there would leave everything green and the feature dead, which is this project's most-repeated defect.

## Open questions: 2 — both yours, both unchanged

1. **Verify the token prices** (two minutes on docs.claude.com). This is now the **fifth** consecutive cycle where WebFetch, WebSearch and the `claude-api` skill were all denied. I made one attempt and stopped rather than rediscover the wall again. Nothing else unblocks the invoice; the tokens are recorded correctly either way, so a wrong rate is a recompute, not lost revenue.
2. **Set `ANTHROPIC_API_KEY` in Azure** when you want this to start costing money. Until then all three AI features render honestly and refuse — visibly, and on the ledger.

