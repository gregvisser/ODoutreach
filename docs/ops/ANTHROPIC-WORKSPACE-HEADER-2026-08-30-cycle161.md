# Row 126 — build `anthropic-workspace-id` header support, unconditionally

**Built the header support the supervisor addition asked for, without waiting
for a value from anyone — because nobody currently needs to supply one.**
Cycle 160 (row 129, commit `7daa9a4`) already found that the key Greg put in
production on 30 August is scoped to a single workspace at creation, and a
workspace-scoped key does **not** need the `anthropic-workspace-id` header at
all — it authenticated and completed two real, billed Anthropic calls without
it. So the header this row adds is correct-but-currently-unused robustness for
a *different* key shape (an identity-linked key that is *not* scoped to a
workspace), not something today's production key requires.

## What changed

`src/server/ai/anthropic-messages.ts` — `callAnthropicMessages` now accepts an
optional `workspaceId` on its request, and sends it as the
`anthropic-workspace-id` header only when set:

```ts
const headers: Record<string, string> = {
  "content-type": "application/json",
  "x-api-key": req.apiKey,
  "anthropic-version": ANTHROPIC_VERSION,
};
if (req.workspaceId) headers["anthropic-workspace-id"] = req.workspaceId;
```

All six AI feature files that call it (`review-campaign.ts`,
`draft-sequence.ts`, `advise-send-times.ts`, `advise-title-messages.ts`,
`explain-rep-performance.ts`, `classify-inbound-reply.ts`) now pass
`workspaceId: process.env.ANTHROPIC_WORKSPACE_ID` alongside the existing
`apiKey: process.env.ANTHROPIC_API_KEY`. `classify-inbound-reply.ts` is
included for consistency (it shares the exact same `callAnthropicMessages`
call) — this does **not** touch, weaken or bypass CR-10
(`ai-feature-data-policy.ts`); that gate still refuses the call before any
network request is made, regardless of this header.

No Azure App Service setting was added or changed. `ANTHROPIC_WORKSPACE_ID` is
documented as a new **optional** setting in `.env.example`, unset everywhere
today. With it unset, `process.env.ANTHROPIC_WORKSPACE_ID` is `undefined`,
`req.workspaceId` is falsy, and the header is not sent — byte-identical to the
request this file sent before this change. **Nobody needs to do anything for
this row to be safe to deploy.**

## Why no value was requested, invented or set

The row's original text asked to get a workspace id from Greg and configure
it. The supervisor addition, added from Anthropic's own current documentation,
corrected that: the 400 only happens for an identity-linked key that is *not*
workspace-scoped, today's key *is* workspace-scoped (proven live in cycle
160), and the header is real robustness for a different situation, not a
requirement of the value existing anywhere. Inventing, guessing or hardcoding
a workspace id was explicitly forbidden. So: build it, prove it fires as code,
leave the setting unset, and record here — as the supervisor addition asked —
that the alternative route (a workspace-scoped key, which is what's already in
production) is what actually removed the need for the header. **Legacy
workspace keys are not the recommended shape and were not reintroduced** —
the key in production is a single-workspace identity-linked key, the shape
Anthropic currently recommends.

## Proof it fires

The supervisor addition set the bar for this specific piece of work
explicitly: *"the header must be observable in the outgoing request in a
test, not merely present in the code."* `src/server/ai/anthropic-messages.test.ts`
does exactly that against a mocked `fetch`, not against the parsed request
body or a code read:

```
✓ callAnthropicMessages — anthropic-workspace-id header > omits the header when no workspace id is configured
✓ callAnthropicMessages — anthropic-workspace-id header > sends the header when a workspace id is configured
```

Red-first: before the `workspaceId` field and the conditional header line
existed, the "sends the header" test failed with the header genuinely absent
from the captured request (`expected { …(3) } to match object { Object
(anthropic-workspace-id) }`) — proof the test can fail, not only pass.

**No new live Anthropic call was made to prove this.** The reason is
deliberate, not an omission: with the setting left unset (see above), this
change makes zero difference to the bytes sent on the wire — the exact
request cycle 160 already proved works live, twice, with real recorded spend:

- `draft-sequence`: **$0.004174** (`costMicroUsd: 4174`), status `OK`
- `review-campaign`: **$0.004468** (`costMicroUsd: 4468`), status `OK`

(both from `docs/ops/AI-FEATURES-REVERIFY-2026-08-30-cycle160.md`, §4, read
directly from the two features' own `logger.info` cost lines against the
production `AiUsageEvent` write). Re-running either call today to get a fresh
`AiUsageEvent` row would spend the client's real money a second time to
observe a request that is provably byte-identical to one already proven to
succeed — that is not evidence, it is waste. If `ANTHROPIC_WORKSPACE_ID` is
ever set in future (a non-workspace-scoped key is put in its place), *that*
change is the one that needs a fresh live proof, because it is the one that
changes what goes over the wire.

## The other part of the row: `messageForFailure()`

Fixed as asked, "cheap to improve alongside it." New
`src/server/ai/ai-failure-messages.ts` exports `describeUnhandledAiFailure`,
which classifies the raw provider-error strings that
`runMeteredAiCall`/`callAnthropicMessages` can produce (`anthropic_http_40x`,
`anthropic_http_429`, `anthropic_http_5xx`, `anthropic_unreadable_body`, a
timeout) into three distinct operator-facing sentences — misconfigured
credentials, rate-limited, provider temporarily unavailable — instead of one
flat "could not be done. Nothing was saved" that reads identically whichever
of those is true. Wired into all five UI actions
(`ai-campaign-review-actions.ts`, `ai-sequence-actions.ts`,
`ai-title-message-actions.ts`, `ai-send-time-actions.ts`,
`ai-rep-performance-actions.ts`):

- The two whose `default` case was previously one flat sentence
  (campaign-review, sequence) now try `describeUnhandledAiFailure` first and
  fall back to their existing sentence only if it returns `null`.
- The three whose `default` case deliberately passes an evidence-gate's own
  plain-English sentence straight through ("Not enough replies yet — 6 of the
  20 needed") keep doing that for gate sentences, but now intercept a raw
  technical error code first — those three features currently never reach a
  live Anthropic call (their evidence gates refuse first on `bidlowai`'s
  volume), so this was a latent gap the queue's own supervisor note warned
  about ("they share the exact same `callAnthropicMessages` call and would
  hit this identical error the moment they get past their gates") rather than
  a defect anyone has seen on screen yet.

Tested in `src/server/ai/ai-failure-messages.test.ts` (5 cases: the exact
workspace-id 400 string, a bad-key 401/403, a 429, a 5xx/unreadable-body/
timeout, and confirming an evidence-gate sentence still returns `null` so the
caller's pass-through is untouched).

## CR-10 — untouched, confirmed by reading the diff

`src/server/ai/ai-feature-data-policy.ts` was not opened for editing. The only
change to `classify-inbound-reply.ts` is the one-line `workspaceId` addition
to its `callAnthropicMessages` call — the `isPersonalDataUncovered` check in
`metered-call.ts` still runs first and still refuses before any network call,
unconditionally, exactly as row 101 built it.

## Gates run

```
npm run lint       → 0 problems
npx tsc --noEmit    → 0 errors
npm test            → 3751 passed, 1 failed, 1 skipped-by-nature*
npm run build       → succeeded (exit 0)
```

\* The one failing test, `relay/cycle-log-reaches-git.test.ts`, is this
repository's own self-check that every cycle log under `.bidlow/relay/log/`
is tracked by git. It failed because `cycle-160.md` was still untracked at
the start of this cycle (the watcher wrote it after cycle 160 exited; this
cycle's commit adds it, as the test's own assertion message says to). It is
expected to pass once this cycle's commit lands.

## Scope discipline

Touched: `src/server/ai/anthropic-messages.ts`,
`src/server/ai/anthropic-messages.test.ts` (new),
`src/server/ai/ai-failure-messages.ts` (new),
`src/server/ai/ai-failure-messages.test.ts` (new), the `workspaceId:` line in
the six AI feature files that call `callAnthropicMessages`, the `default:`
case in the five UI action files, `.env.example`, this document, and the
`.bidlow/relay/QUEUE.md` status line. No schema change, no migration, no send,
no client data touched, no secret value read, printed, logged or written
anywhere in this row.

## Not decided here, left for whoever reads it next

The alternative named in row 129 and the supervisor addition — scoping the key
to a single workspace at creation — was already done by Greg on 30 August, so
there is nothing left to decide about *this* key. What remains genuinely open
is only: if a future Anthropic key in this project is ever an identity-linked
key **not** scoped to a workspace, `ANTHROPIC_WORKSPACE_ID` is the setting to
add in Azure App Service config to fix the resulting 400 — no code change
would be needed, only the value.
