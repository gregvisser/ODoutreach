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
