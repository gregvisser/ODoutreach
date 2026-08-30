# CR-10 — the engineering half — 2026-08-30 (cycle 125)

**Scope of this row, stated plainly:** this closes the ENGINEERING half of
CR-10 only. It does not decide whether Bidlow/OpensDoors pursues an Art.28 DPA
with Anthropic — that stays open as CR-10's other half, a commercial decision
for Greg. It does not touch `.bidlow/GRADES.json`, does not re-score any
dimension, and does not close CR-10 itself.

## The gap this closes

Six AI features (row 80, shipped 28–29 August) all route through
`src/server/ai/metered-call.ts`. One of them — `classify-inbound-reply.ts` —
sends a real prospect's own inbound reply (subject line plus up to 2,000
characters of body, verbatim) to Anthropic's Messages API. CR-05's Art.28 DPA
work covered Sentry, Resend and RocketReach; Anthropic was never assessed and
carries no recorded processor allowance.

Before this row, the only thing stopping that reply text from reaching an
uncovered third party was `metered-call.ts`'s `no_api_key` refusal — which
fires only because `ANTHROPIC_API_KEY` happens to be unset in the live App
Service today. There was no code-level check that the vendor was actually
covered. Setting one environment variable would have been enough, by itself,
to start sending prospects' words to Anthropic.

## What changed

New file `src/server/ai/ai-feature-data-policy.ts` declares, for every
`AiFeature`, which vendor it reaches and whether the call carries a
prospect's own personal data — the same shape as the existing
`src/lib/monitoring/sentry-data-collection.ts` precedent (one explicit,
exhaustive policy in one place, typed so a missing entry fails to compile,
read back and asserted by its own test). A second, separately-exported
`COVERED_PROCESSORS` set names vendors with a recorded Art.28 allowance —
deliberately empty of `"ANTHROPIC"`.

`metered-call.ts` gained a fourth fail-closed check, alongside
`ai_features_switched_off`, `no_api_key` and `no_rate_for_model`:

```ts
if (isPersonalDataUncovered(feature)) return refuse("no_processor_allowance");
```

This runs — and refuses, writing a `REFUSED` ledger row, calling `invoke`
zero times — regardless of whether an API key is configured.

## The declaration: which of the six is refused, and why the other five are not

| Feature | Carries personal data? | What it actually sends |
|---|---|---|
| `REPLY_CLASSIFICATION` | **YES — refused** | The prospect's own inbound reply, subject + body, verbatim. |
| `SEQUENCE_DRAFTING` | No | The client's own sequence-drafting brief (audience, offer, tone). |
| `CAMPAIGN_REVIEW` | No | The client's own sequence steps and template copy. |
| `SEND_TIME_ADVICE` | No | Aggregated send/reply counts by time slot, computed before the model is called. |
| `REP_PERFORMANCE` | No | Aggregated send/reply counts by sending mailbox, computed before the model is called. |
| `TITLE_MESSAGE_FIT` | No | Aggregated send/reply counts by job-title family and campaign, computed before the model is called. |

This matches cycle 122's original finding (recorded when CR-10 was raised):
of the six, only `REPLY_CLASSIFICATION` carries a prospect's own words; the
other five carry aggregated statistics or the client's own content. Verified
again this cycle by reading each feature file's actual `invoke` body, not by
re-reading the earlier finding.

## Red first — quoted verbatim

Three new tests were written against the **unchanged** gate (no fourth check
yet) and run to confirm they failed for the right reason — that the personal-
data feature was NOT refused, `invoke` WAS called, and the ledger recorded a
non-refusal outcome:

```
 ❯ src/server/ai/metered-call.test.ts (13 tests | 1 failed)
   × the personal-data processor gate (CR-10) > refuses a feature declared to
     carry prospect personal data when its vendor has no recorded processor
     allowance — EVEN WITH A REAL API KEY
     → Cannot read properties of undefined (reading 'usage')

 ❯ src/server/ai/classify-inbound-reply.test.ts (6 tests | 2 failed)
   × the personal-data processor gate (CR-10) > refuses to classify — and
     never calls Anthropic — even though a valid API key is configured
     → expected true to be false // Object.is equality
   × the personal-data processor gate (CR-10) > still records the refusal on
     the usage ledger, against the client that received the reply
     → expected 'OK' to be 'REFUSED' // Object.is equality

FAIL src/server/ai/classify-inbound-reply.test.ts > the personal-data
processor gate (CR-10) > refuses to classify — and never calls Anthropic —
even though a valid API key is configured
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
- false
+ true
 ❯ src/server/ai/classify-inbound-reply.test.ts:63:28

FAIL src/server/ai/classify-inbound-reply.test.ts > the personal-data
processor gate (CR-10) > still records the refusal on the usage ledger,
against the client that received the reply
AssertionError: expected 'OK' to be 'REFUSED' // Object.is equality
Expected: "REFUSED"
Received: "OK"
 ❯ src/server/ai/classify-inbound-reply.test.ts:76:24

FAIL src/server/ai/metered-call.test.ts > the personal-data processor gate
(CR-10) > refuses a feature declared to carry prospect personal data when its
vendor has no recorded processor allowance — EVEN WITH A REAL API KEY
TypeError: Cannot read properties of undefined (reading 'usage')
 ❯ Module.runMeteredAiCall src/server/ai/metered-call.ts:165:52
    163|   }
    164|
    165|   const costMicroUsd = computeCostMicroUsd(invoked.usage, rate);
    166|   await record({
    167|     status: "OK",

 Test Files  2 failed (2)
      Tests  3 failed | 16 passed (19)
```

The `Cannot read properties of undefined (reading 'usage')` failure is the
proof point: against the unchanged gate, the test's `invoke` mock (a bare
`vi.fn()` with no resolved value) was actually invoked and its `undefined`
return value flowed into the cost calculation — exactly the live pathway CR-10
describes, with a mock standing in for a real Anthropic call.

After adding the fourth check, all three tests turned green with no other
change to the assertions, and a fourth generic test proved the gate is narrow
(a non-personal-data feature still runs and returns `ok: true`, `invoke`
called once, ledger status `OK`).

## Test-suite honesty note

Adding this gate made `classifyInboundReply` permanently refuse, today,
regardless of any API key — because `REPLY_CLASSIFICATION` is (correctly)
declared to carry personal data and Anthropic is (correctly) uncovered. That
retired three pre-existing tests in `classify-inbound-reply.test.ts` that
asserted a successful classification (model called, label parsed, row
updated) and one asserting a `no_processor_allowance`-shaped model failure —
those code paths (an unparseable tool call; a thrown `invoke` error) are now
unreachable through this function until Anthropic is covered, and a test that
still claimed to exercise them would be quietly testing the gate instead
while looking like it tested the parser. Rather than leave misleading green
tests, they were removed and replaced with two tests that assert the true
current behaviour (refused, ledger-honest, model never called). The
underlying parsing logic they used to exercise indirectly (`buildClassification
Input`, `parseClassificationToolUse`) remains directly covered by
`src/lib/ai/reply-classification.test.ts`, which this row did not touch.
Restoring the retired integration coverage is naturally the job of whichever
future row grants Anthropic a recorded processor allowance.

`metered-call.test.ts`'s generic ledger/refusal tests were re-pointed from
`REPLY_CLASSIFICATION` to `SEQUENCE_DRAFTING` (same priced model, so the cost
math is unchanged) so that they keep testing `runMeteredAiCall`'s general
behaviour rather than colliding with the new feature-specific gate.

## Gates run

- `npm run lint` — 0 problems.
- `npm run typecheck` — 0 errors.
- `npm test` — 349 files, 3654 tests, all green.
- `npm run build` — webpack production build, green (see commit for the run this artefact accompanies).

## What is now true that was not true before

**Setting `ANTHROPIC_API_KEY` in production can no longer, by itself, send a
prospect's own words to an uncovered processor** — the reply-classification
feature is refused by a fourth, code-level check that reads a fixed
declaration of what each AI feature sends, independent of whether a key is
configured, and stays refused until a future, separate decision records an
Anthropic processor allowance in `ai-feature-data-policy.ts`.
