# Cycle 90 — queue item 80

## What it did

Shipped the sixth slice of row 80: **item (5), "AI-chosen send times".** Staff
press one button on a client's Outreach tab and get, from that client's OWN
sending history, which days and hours their prospects actually reply — read by
the model and explained in plain English, with every recommendation labelled
according to whether the automatic sender can actually reach it. It reschedules
nothing. Row 80 goes to `PARTIAL 90`: items 6–7 are untouched and the token
prices are still unverified.

## PR sweep

`gh pr list --state open` returned **nothing**. Cycle 89 left the board clean
and this cycle inherited it. Nothing to merge, nothing to comment on. Three
consecutive cycles have now started clean, which suggests the start-of-cycle
sweep has actually fixed the landfill rather than just drained it once.

## The brief was right, and one word in it needed a decision

The queue says "AI-chosen send times". Taken literally that is a scheduler: the
model picks a time and the system sends then. **That feature cannot be built
here, and finding out why was most of the reconnaissance.**

Nothing in this application decides when mail leaves. There is no send window,
no per-client sending hours, no `Europe/London` anywhere in `src/`, and no
column a scheduler could read. The only thing that controls dispatch timing is
a cron expression in `.github/workflows/process-outbound-queue.yml`. So
"AI-chosen send times" as an automatic feature would mean building a scheduler
AND handing the model the dispatch clock, in the same change, for a product that
mails strangers from real corporate mailboxes.

So the decision, recorded rather than escalated: **the model advises, a person
acts.** That is the same call cycles 88 and 89 made about sequence delays and
replacement copy, and this is the third instance of one rule.

## The guardrail is the tool schema, not the prompt

`SEND_TIME_ADVICE_TOOL` has no field in which the model can express a schedule.
No delay, no cron expression, no minute, no date, no `sequenceId` to apply the
answer to. A weekday, two hours, and prose.

That is structural on purpose, because the value of such a field would be the
danger. A `delayHours` on this schema would have exactly two futures: dead, or
wired to the dispatch clock by a later cycle that read the field name as
permission. A test asserts the serialised schema contains none of those words.

## Three things this cycle got right that a naive build gets wrong

**1. The hour is not the UTC hour.** `sentAt` is stored in UTC; the prospects
are in the UK. For seven months of the year those differ by one. A "best time to
send" bucketed with `getUTCHours()` would be confidently sixty minutes wrong for
most of the year, and nothing about the output would look wrong. Every timestamp
is read through `Europe/London`, and a test asserts the same UTC hour reads as
two different UK hours in January and July — so a future `getUTCHours()`
"simplification" goes red.

**2. The gate fails closed BEFORE the money is spent.** The evidence is assessed
first; below the thresholds there is no request, no tokens, no ledger row and no
charge. And it names what is missing — "Not enough replies yet, 6 of the 20
needed" — because "not enough data" tells an operator nothing they can act on.

The sharpest part of it is the slot filter. A slot with three sends and one
reply is a 33% reply rate, and **a model shown 33% will recommend it over an
honest 12% built on a hundred sends**. So slots below the threshold are dropped
before the prompt is built. The system prompt also says to prefer volume, but a
prompt is advice and a filter is structure — the same distinction as the
240-character cap in cycle 89.

**3. The reachability finding, which is the part I did not expect.** The cron
fires on UTC hours (`*/5 7-18 * * 1-5`) while the advice is in UK local time, so
**the reachable band shifts by an hour when the clocks change**. A recommended
07:00 is reachable in winter and impossible in summer; 19:00 is the mirror
image; Saturday is never reachable at all. Nobody works that out by hand, and
without it the panel would print a sensible-looking recommendation that the
sender can never act on.

`windowReachability` computes it, and the two constants are **asserted against
the real workflow file** by a test that reads `process-outbound-queue.yml` and
parses the cron. Editing the schedule turns a test red rather than quietly
making this module lie.

## Red-first

**`src/lib/ai/send-time-evidence.test.ts` — 21 tests, watched against a
deliberately naive stub: 19 FAILED, 2 passed.** The two that passed are the
negative assertions a `sufficient: false` stub satisfies for free, which is what
proves the other 19 were not vacuous.

**`src/lib/ai/send-time-advice.test.ts` failed for real while being written**
(1 failed / 32 passed): the prompt assertion `"not applied automatically"` did
not match because the sentence was split across a line break in the joined
array. Same class as cycle 89's case-sensitivity slip, and the same lesson —
direct evidence the assertion inspects the real prompt rather than passing
vacuously. The prompt was reworded so the sentence is contiguous.

**`src/server/ai/advise-send-times.test.ts` was proved capable of failing by
deliberately breaking the code**, since it starts green. Three breaks at once:
dropping `clientId` from the outbound lookup, adding an `outboundEmail.updateMany`
that "applies" the advice, and placing a model call before the evidence gate.
Result:

```
× SPENDS NOTHING when the history is too thin
× changes NOTHING about when anything is sent
× reads only this client's mail, so one tenant cannot bill for another's
× records a REFUSED ledger row when there is no API key
× does not retry a failed call, because a retry can be a second charge
Tests  5 failed | 10 passed (15)
```

Reverted; re-run green, and `grep` confirms the scoping line is back and no
`updateMany` remains.

## Proving it fires, not that it exists

The row's standing warning is six things built, wired, reporting success and
never firing. The three test files above share one blind spot:
`advise-send-times.test.ts` mocks `callAnthropicMessages`,
`send-time-advice.test.ts` hands the parser a hand-written block, and
`send-time-evidence.test.ts` never goes near the model.

`src/server/ai/send-time-advice-roundtrip.test.ts` closes it: the real evidence
builder, the real request builder, the real HTTP layer, the real parser and the
real reachability check, with only `fetch` faked. It asserts the outgoing body
carries the forced `tool_choice`, that the counts in the prompt are OUR counts
in **UK local hours** (`Monday 09:00 | sent 100 | replies 14` — from a BST
timestamp, so the one-hour bug would fail here), that the token counts survive
the trip, that a refusal parses as *no advice* rather than as "no good times",
and that a returned 07:00 window comes back labelled `winter_only` and a
Saturday one `never`.

It cannot call the real API and does not pretend to: there is no key, and a test
that spent money would be a bad test. Every layer we own is proved consistent;
the only untested link left is Anthropic's own.

## What "done" looks like

Staff open a client's Outreach tab, press one button, and see which days and
times that client's prospects actually reply — with the numbers underneath, a
plain-English explanation, and a clear note on any suggestion the automatic
sender cannot act on — and no email is sent and no schedule changes.

## Gates

* `npm run lint` — clean (exit 0).
* `npm run typecheck` — clean (exit 0).
* `npm test` — **3476 passed, 335 files** (up from 3403 / 331 on the merge base).
* `npm run build` — green.
* `npx prisma validate` — valid; `SEND_TIME_ADVICE` and `AiSendTimeAdvice`
  present in the generated client.

No flake this run — the Sentry DSN test that flaked in cycle 89 passed first
time here.

## The migration, and why I merged it myself

`20260829140000_ai_send_time_advice` adds one enum value
(`ALTER TYPE "AiFeature" ADD VALUE 'SEND_TIME_ADVICE'`) and creates one new
table (`AiSendTimeAdvice`) with two foreign keys onto it.

The brief names both as ADDITIVE and mine. Its stated test — does dropping what
this adds restore today's behaviour exactly? — is satisfied: no existing table,
column or type is dropped, altered, rewritten or backfilled, and no code path
outside the new panel reads either object. Cycles 88 and 89 recorded the same
reasoning for the same shape.

`ALTER TYPE ... ADD VALUE` is transaction-safe on PostgreSQL 12+ provided the
new value is not USED in the same transaction. It is not.

There is deliberately no column a scheduler could consume: the windows are
stored as JSON for display, not as a setting. A column named like a setting
would eventually be read as one.

No client data is moved, and no email can be sent by any path this adds.

## STILL OPEN — and (a) has not moved in SIX cycles

**(a) The per-token prices are STILL unverified. ENVIRONMENT BLOCK.** Six
consecutive cycles (85–90). I did not spend a seventh rediscovering the same
wall. Everything downstream survives it correctly: every `AiUsageEvent` stores
raw tokens, both applied rates and the `rateVersion`, so a wrong rate is a
recompute and not lost revenue, and `/settings/ai-spend` says on its face that
the figures are unverified. This cycle again introduced **no second unverified
price** — send-time advice reuses the one model already in the rate table, for
the fourth feature running.

**(b) `ANTHROPIC_API_KEY` is still unset in Azure.** In production this panel
renders and honestly says "The AI is not configured on this environment yet".
Nothing is charged and nothing is analysed until the key is set. Setting it is
Greg's call because it starts real spend against a real invoice.

**(c) Items 6–7 untouched:** rep performance dashboard with AI explaining the
differences, and best-message-by-job-title.

## A note for whoever builds item (6)

The reply-linkage caveat found here applies there too, and harder. A reply is
counted only when `linkedOutboundEmailId` points at a send. Unlinked replies
exist — Gmail rewrites Message-IDs, so the matcher cannot always be certain
(see the reply-matching pipeline notes) — and they were deliberately NOT counted
here, because an unlinked reply has no send time to attribute to. A **rep**
performance dashboard has the same hole with more consequence: an unlinked reply
has no rep either, and a rep whose replies happen to link less often would look
worse at their job. Whoever builds it should decide that explicitly rather than
inherit it.

## Open questions for Greg: 2

1. **Verify the token prices** (two minutes, docs.claude.com). Six cycles
   blocked; nothing else unblocks the invoice.
2. **Set `ANTHROPIC_API_KEY` in Azure** when you want the AI features to start
   costing money — until then classification, drafting, review and send-time
   advice all refuse, visibly and on the ledger.
