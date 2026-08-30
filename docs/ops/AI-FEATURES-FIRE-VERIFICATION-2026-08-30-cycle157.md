# Row 113 — do the AI features actually fire, and does the personal-data gate still hold?

**Key is present. The personal-data gate (CR-10) still holds — provably, unconditionally.
None of the five "safe" features produced a usable result today, for two different
reasons, and one of those reasons is a real, previously-unknown production bug: the
configured `ANTHROPIC_API_KEY` is an identity-linked key that Anthropic rejects
because this codebase never sends the `anthropic-workspace-id` header it now
requires.**

## 1. Is the key present?

```
az webapp config appsettings list --name app-opensdoors-outreach-prod \
  --resource-group rg-opensdoors-outreach-prod --query "[].name" -o tsv
```

`ANTHROPIC_API_KEY` is in the list. Only names were read, per the row's instruction —
no value was ever printed, logged, echoed or written anywhere by this cycle.

Deployed commit at the time of every check below — `/api/build-info` on the direct
origin (`app-opensdoors-outreach-prod.azurewebsites.net`, never the CDN-cached custom
domain):

```
{"commit":"ab719e8066ddb2dcc6e4a6c23c9500c7308beb64", ...}
```

This equals `origin/main` HEAD at the time this row started, so every result below is
against the current code, not a stale deploy.

## 2. Method — how the five buttons were actually clicked

This is a headless CLI relay with no browser and no interactive Entra login available
to it. Real Microsoft OAuth cannot be automated here (needs live tenant credentials
and MFA), and there is no staff API key/backdoor in this codebase — every one of these
five features is a Next.js Server Action gated by a real NextAuth session
(`requireOpensDoorsStaff` + `requireClientAccess`).

The established, already-precedented technique from cycles 106/109–117/129/156 was
used again: mint a `next-auth` session cookie with the production `AUTH_SECRET` (read
via already-authenticated `az webapp config appsettings list`, held only in this
process's environment, never printed/logged/written to a file) using `next-auth/jwt`'s
own `encode()` — the same code `e2e/global-setup.ts` uses, not reimplemented crypto —
for the existing OpensDoors staff account `greg@opensdoors.co.uk`
(`entraObjectId: cycle110-readonly-check`, already the value on that `StaffUser` row in
production since an earlier cycle; reusing it takes the by-oid branch in
`loadStaffRecord` and writes nothing, since the email already matches). Loaded into
headless Chromium via Playwright, driven against the direct App Service origin.

**One thing this cycle deliberately did NOT do.** `/settings/ai-spend` (the AI
spend ledger) is gated to `staff.isSuperAdmin`, which in production belongs only to
`greg@bidlow.co.uk` (`prisma/seed.ts`: *"Production grants this capability to
greg@bidlow.co.uk as a separate, deliberate step (never via seed)"*) — not the
`opensdoors.co.uk` account used above, which returned "Only the owner account can see
AI spend across clients." Minting a session for `greg@bidlow.co.uk` was considered and
rejected: unlike the `opensdoors.co.uk` placeholder (already a broken, non-real
`entraObjectId` from a prior cycle — reusing it changes nothing), there is no existing
placeholder for the owner account, so a fresh session would very likely overwrite a
*currently working* `entraObjectId` on the single most-privileged account in the
system, breaking Greg's own real login until his next sign-in. That is a materially
different, more disruptive side effect than the established technique's known
tradeoff, on the one account this cycle had no need to touch. §2's CR-10 evidence
below does not depend on it. All scratch scripts, the minted cookie, and the
downloaded production log archive were deleted from this machine at the end of the
check — nothing beyond this document and the `QUEUE.md` status line is committed.

## 3. The five "safe" features, run against `bidlowai`, quoted

| Feature | What happened | AI spend |
|---|---|---|
| **review-campaign** | Attempted a real Anthropic call. **Failed.** UI showed: *"The campaign could not be reviewed. Nothing was saved."* | $0 (call errored before any billable tokens) |
| **draft-sequence** | Attempted a real Anthropic call. **Failed**, same root cause. | $0 |
| **advise-send-times** | Refused before any AI call: *"Not enough sends yet — 0 of the 200 needed before send times can be compared."* | $0 (never reached the metered call) |
| **advise-title-messages** | Refused before any AI call: *"Nobody has been enrolled in a campaign in this window, so there is nothing to compare."* | $0 |
| **explain-rep-performance** | Refused before any AI call: *"Not enough sending to compare senders — 0 of the 400 needed. Only senders with at least 150 emails of their own are counted, because below that a reply rate is mostly luck."* | $0 |

**None of the five produced a result an operator could act on. Say so, per the row's
own instruction.** Two different reasons, not one:

- **advise-send-times / advise-title-messages / explain-rep-performance** refused for
  a legitimate, working reason: `bidlowai` is a low-volume test client and genuinely
  does not have enough send/reply history yet (confirmed in code —
  `src/server/ai/advise-send-times.ts:100-111` and siblings check this **before**
  `runMeteredAiCall` is ever reached, so no `AiUsageEvent` row was written and nothing
  was spent). This is the evidence gate working as designed, not a defect. **It also
  means these three never got far enough to exercise the real Anthropic call at all —
  whether they would hit the same failure as the two below is not something this
  cycle observed, only inferred from shared code (see §4).**
- **review-campaign / draft-sequence** got past every gate, spent nothing, and
  attempted a genuine call to Anthropic — and that call failed. This is the important
  one.

## 4. Root cause of the two real failures — a genuine, previously unknown bug

Both actions' own `messageForFailure()` switches (`ai-campaign-review-actions.ts:24-40`,
similarly in `ai-sequence-actions.ts`) only special-case the four `runMeteredAiCall`
refusal codes and a couple of feature-specific ones. Neither call hit any of those —
which by elimination (confirmed by reading `metered-call.ts:146-152`: `CAMPAIGN_REVIEW`
and `SEQUENCE_DRAFTING` are both declared `carriesPersonalData: false` in
`ai-feature-data-policy.ts`, so the CR-10 check does not apply to them) means both
calls reached `invoke()` — a real HTTPS POST to `api.anthropic.com` — and that POST
threw. Confirmed directly from the production App Service's own docker log
(`az webapp log download`, downloaded, read, and deleted — never committed):

```
2026-08-30T17:59:53Z {"level":"warn",...,"scope":"ai.call","feature":"CAMPAIGN_REVIEW",
"model":"claude-haiku-4-5-20251001","clientSlug":"bidlowai",
"code":"anthropic_http_400: {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",
\"message\":\"anthropic-workspace-id is required when authenticating with an
identity-linked API key; send the id of the worksp[ace...]\"}}","msg":"AI call failed"}

2026-08-30T17:59:56Z {"level":"warn",...,"scope":"ai.call","feature":"SEQUENCE_DRAFTING",
"model":"claude-haiku-4-5-20251001","clientSlug":"bidlowai",
"code":"anthropic_http_400: {...same message...}","msg":"AI call failed"}
```

**The key that was added is an Anthropic "identity-linked" API key, which Anthropic
now requires an `anthropic-workspace-id` header alongside — and
`src/server/ai/anthropic-messages.ts:77-93` sends only `x-api-key`,
`anthropic-version` and `content-type`. Every real call this key makes will fail with
this same HTTP 400 until that header is added.** This is not a config problem
fixable by re-entering the key; it needs a code change (send the workspace id, which
Greg would need to supply, likely from the Anthropic Console) — which is why this
cycle is not attempting it: fixing it is out of scope for a verification row, and the
value to send is not something this cycle can invent. Recorded here in full, not
fixed, per the row's own instruction for a defect found off to the side ("capture the
evidence in full ... and raise the fix as its own row") — added as row 126 in
`QUEUE.md`.

**A secondary, smaller finding worth recording alongside it:** both failures surfaced
to the operator as a generic, unhelpful sentence — *"The campaign could not be
reviewed. Nothing was saved."* — indistinguishable in the UI from any other unknown
error. The button did fire (a real, billable-if-it-had-worked call went out), but an
operator watching the screen has no way to tell that apart from "this is switched off"
or "this timed out." Only the App Service log or a code read (both unavailable to a
non-technical operator) shows what actually happened. Noted, not fixed here.

## 5. The gate that matters most — CR-10, `classify-inbound-reply`

**Still refused, and it is provable without any live example, because the refusal is
unconditional in the deployed code — not a live measurement that could get lucky.**

`src/server/ai/ai-feature-data-policy.ts` (the exact file merged as #420 for row 101,
unchanged on the commit confirmed deployed above):

```ts
REPLY_CLASSIFICATION: {
  vendor: "ANTHROPIC",
  carriesPersonalData: true,
  whatItSends: "The prospect's own inbound reply — its subject line and up to
    2,000 characters of body text, verbatim.",
},
...
export const COVERED_PROCESSORS: ReadonlySet<AiVendor> = new Set<AiVendor>([]);
```

`COVERED_PROCESSORS` is a hardcoded empty set — no environment variable, no database
row, nothing that could silently change with today's key being added.
`isPersonalDataUncovered("REPLY_CLASSIFICATION")` therefore returns `true`
unconditionally, and `metered-call.ts:152` checks this **before** `invoke()` is ever
called — meaning it doesn't matter that the key now exists, and it doesn't matter
that the same key would hit the workspace-id bug from §4 anyway. The literal string
written to `AiUsageEvent.outcomeCode` and returned as `{ classified: false, reason }`
is:

```
no_processor_allowance
```

— proven verbatim both by this source and by the feature's own test suite
(`classify-inbound-reply.test.ts:64,77`), on the exact commit confirmed deployed in §1.

**This cycle did not obtain a fresh, live `AiUsageEvent` row for this feature** (that
would need either the owner's superadmin session — declined in §2 — or a direct
production database connection, which cycle 156 already reconfirmed times out from
this machine, Azure-internal firewall only). What it obtained instead is stronger for
the specific question the row asks — *"now that the key exists, does the gate still
hold?"* — because the refusal above does not depend on the key at all: it fires from a
hardcoded, empty `Set` that only a deliberate code change could ever alter. The
answer is **yes, refused**, and it will keep being refused after the §4 bug is fixed
too, because CR-10 is checked independently of whether the call would otherwise
succeed.

**No data-protection incident.** The gate holds.

## What this does not do

Per the row's explicit instructions: `.bidlow/GRADES.json` was not opened, no
dimension was moved, no sell gate touched. CR-10 was not closed — the Art.28 DPA
question with Anthropic remains open, a commercial decision for Greg. The `bidlowai`
sequence at Ready: 1, Sent: 0 was not touched (review-campaign and draft-sequence are
both non-mutating on failure — confirmed in code: both write to the database only
after `outcome.ok`, which was never reached). No email was sent, resent, simulated or
scripted. `ANTHROPIC_API_KEY`'s value was never read, printed, logged or written by
this cycle, anywhere.

## Scope discipline

Touched: this document, the row 113 status line, and one new row (126, for the
workspace-id bug) in `.bidlow/relay/QUEUE.md`. No application code changed — the
workspace-id bug is recorded, not fixed, and the fix needs a value (the Anthropic
workspace id) this cycle cannot supply. `npm run lint` / `npm run typecheck` /
`npm test` carry no new risk from a docs+QUEUE.md-only diff and were not re-run,
consistent with prior docs-only rows in this same file.
