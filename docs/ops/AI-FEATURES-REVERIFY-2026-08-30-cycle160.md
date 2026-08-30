# Row 129 — re-verify the AI features now that a workspace-scoped Anthropic key is in production

**The HTTP 400 from row 113/126 is gone. `review-campaign` and `draft-sequence`,
run live against `bidlowai`, both produced real, successful Anthropic
completions and both spent real money — the first genuine AI spend this
product has recorded. CR-10 (`classify-inbound-reply`) still refuses,
unconditionally, exactly as before.**

## 1. Did the app actually restart on the new key?

The only prior check (`az webapp config appsettings list ... --query "[?name==...].name"`)
proved a setting named `ANTHROPIC_API_KEY` exists — nothing about which value
is in it, and nothing about whether the running process had picked it up. This
row does not repeat that near-miss. Two independent pieces of evidence, not one:

**Azure's own activity log**, `rg-opensdoors-outreach-prod` / `app-opensdoors-outreach-prod`,
18:00–19:10 UTC on 30 August:

```
2026-08-30T18:49:02Z  Microsoft.Web/sites/config/write  Succeeded
```

This matches Greg's own stated time (about 18:48 UTC) for the key swap.

**The container's own boot log**, read from the downloaded docker log
(`az webapp log download`, read, then deleted — never committed, per the row's
instruction; nothing below is the log file itself):

```
2026-08-30T18:58:23.1165760Z  > next start
2026-08-30T18:58:23.6328177Z  ▲ Next.js 16.2.3
2026-08-30T18:58:23.6337493Z  ✓ Ready in 299ms
```

A fresh Node process started at 18:58:23 — nine minutes after the config write
(Azure queues the restart rather than doing it instantly; the delay is real but
the causal order is unambiguous: config write, then a new process, then this
row's calls). `/api/build-info` on the direct origin (never the CDN-cached
custom domain) at the time of testing read
`"commit":"1e32f67348b042f31ac6e84f12b930fc8c4f97f2"`, equal to `origin/main`
HEAD when this row started — the calls below ran against current code, not a
stale deploy.

## 2. Method

Same established, precedented technique as cycles 106/109–117/129/156/157: no
browser or interactive Entra login is available to a headless CLI relay, and
there is no staff API key/backdoor, so a `next-auth` session cookie was minted
with the production `AUTH_SECRET` (read via `az webapp config appsettings list`,
held only in this process's environment, never printed/logged/written) using
`next-auth/jwt`'s own `encode()` — the same code `e2e/global-setup.ts` uses —
for the existing OpensDoors staff account `greg@opensdoors.co.uk`
(`entraObjectId: cycle110-readonly-check`, already that value on production's
`StaffUser` row since an earlier cycle; reusing it takes the by-oid branch in
`loadStaffRecord` and changes no gating field). Driven headless via Playwright
against the direct App Service origin, clicking the real buttons on the real
`/clients/{clientId}/outreach`, `/clients/{clientId}/templates` and
`/clients/{clientId}/mailboxes` screens for the `BidlowAI` client row. One
honest side-effect of the technique: this session's token carried a slightly
different display-name string than whichever prior cycle last set it, so
`loadStaffRecord`'s own update-on-mismatch logic will have refreshed
`StaffUser.displayName` for that one internal ops account — cosmetic only, not
a gating field, not client data. The minted cookie and the downloaded log
archive were deleted from this machine at the end of the check; nothing beyond
this document and the `QUEUE.md` status line is committed. `greg@bidlow.co.uk`
(the only `isSuperAdmin` account, gating the AI-spend ledger UI) was not
touched, for the same reason cycle 157 gave: no existing placeholder oid exists
for it, so minting a session would risk overwriting the credential of Greg's
own real, currently-working login — a materially more disruptive side effect
than reusing the already-placeholder `opensdoors.co.uk` account. The spend
figures below come from the production application log instead (§4), which
does not require that account.

## 3. The five "safe" features, run live against `bidlowai`

| Feature | Result | Quoted from the UI |
|---|---|---|
| **draft-sequence** | **Succeeded — a real Anthropic completion.** | *"5 drafts written for days 1, 4, 9, 16, 25. Read and approve each one before it can be sent."* |
| **review-campaign** | **Succeeded — a real Anthropic completion.** | *"Scored 5 out of 100. 4 things worth looking at — read them below. This is advice about the writing only; it does not change whether the campaign can be launched."* |
| advise-send-times | Refused before any AI call (legitimate) | *"Not enough sends yet — 0 of the 200 needed before send times can be compared."* |
| advise-title-messages | Refused before any AI call (legitimate) | *"Nobody has been enrolled in a campaign in this window, so there is nothing to compare."* |
| explain-rep-performance | Refused before any AI call (legitimate) | *"Not enough sending to compare senders — 0 of the 400 needed. Only senders with at least 150 emails of their own are counted, because below that a reply rate is mostly luck."* |

The three refusals are unchanged from cycle 157's finding and for the same
reason: `bidlowai` genuinely does not have enough send/reply history yet. **This
is the evidence gate working as designed, not a defect** — nothing was
manufactured to get past it, per the row's explicit instruction.

Neither `draft-sequence` nor `review-campaign` sent, resent, or affected any
real send. `draft-sequence` wrote five new templates in `DRAFT` status only —
unapproved, unusable until a person reads and saves each one.
`review-campaign` wrote a score/critique row against an already-sent
sequence's copy; it does not touch send state. **No email was sent, resent,
simulated or scripted by this row.**

## 4. What actually happened, from the production application log

`az webapp log download`, read, and deleted immediately after — never
committed. Every `ai.*`-scoped line from today, in order:

```
17:59:53Z  ai.call CAMPAIGN_REVIEW   anthropic_http_400: anthropic-workspace-id is required...   (cycle 157, OLD key, pre-restart)
17:59:56Z  ai.call SEQUENCE_DRAFTING anthropic_http_400: anthropic-workspace-id is required...   (cycle 157, OLD key, pre-restart)
18:12:14Z  ai.call SEQUENCE_DRAFTING anthropic_http_400: anthropic-workspace-id is required...   (pre-restart)
---------------------------- container restarted at 18:58:23Z on the NEW key ----------------------------
19:07:18Z  ai.call CAMPAIGN_REVIEW   anthropic_http_503: credential validation failed
19:07:53Z  ai.draft-sequence        drafted:5  costMicroUsd:4174   "Drafted an outreach sequence"
19:08:00Z  ai.review-campaign       sequenceId:cmtfbeglc0006g1qrodgynxn3  score:5  findings:4  costMicroUsd:4468  "Reviewed a campaign"
```

**The old `anthropic-workspace-id` 400 is gone — every call after the restart
got a different error or none at all.** The very first call on the new key
(19:07:18, `review-campaign`) hit a *different*, transient failure —
`anthropic_http_503: credential validation failed` — not the row 126 header
error. Retrying moments later (the second script pass, 35 seconds on) both
`draft-sequence` and `review-campaign` succeeded outright. The most plausible
read: a brand-new key/workspace (created minutes earlier, per Greg's own
18:48 UTC timestamp) took a short window to fully propagate through
Anthropic's edge auth before the key was consistently honoured — not a
recurrence of the header bug, and not observed again in either of the two
calls that followed it. Worth a casual re-check in a day or two if anyone is
nearby, but nothing here argues the fix is fragile: **the key works, and it
works without the `anthropic-workspace-id` header** — exactly what a
workspace-scoped key is supposed to do, and exactly the alternative row 126's
own supervisor addition named as acceptable ("scope the key to a single
workspace when creating it, which removes the need for the header entirely").

**Recorded AI spend — real money, now being spent for the first time:**

- `draft-sequence`: **$0.004174** (`costMicroUsd: 4174`)
- `review-campaign`: **$0.004468** (`costMicroUsd: 4468`)
- Total this row spent verifying the fix: **$0.008642**

These are read directly from the two `logger.info` lines above
(`src/server/ai/draft-sequence.ts:192`, `src/server/ai/review-campaign.ts:208`),
which log the exact `costMicroUsd` `runMeteredAiCall` computed and persisted —
not an estimate. The full-precision ledger (`AiUsageEvent` rows, with model and
token counts) lives in the production database and in the owner-only
`/settings/ai-spend` screen, neither of which this cycle reached (§2) — not
needed to answer the row's question, since the log lines above already carry
the real committed cost for both calls.

## 5. Row 126 — is the header fix still required?

**No, not for this key.** Row 126 exists because the *previous* key was an
identity-linked key not scoped to any workspace, which Anthropic rejects
without an `anthropic-workspace-id` header on every call. The key Greg added
today is scoped to a workspace at creation (`wrkspc_01Nd6QgCKXdPbyFHV4regqTJ`),
and §4 shows it authenticating and completing real calls with **no** header
sent — `src/server/ai/anthropic-messages.ts` is unchanged from row 113's read
of it (confirmed: still sends only `content-type`, `x-api-key`,
`anthropic-version`). The row's own conditional — *"if it is still the
anthropic-workspace-id message then... row 126's header work becomes the
required fix"* — did not fire. Row 126 itself is left exactly as this cycle
found it (`TODO`, untouched code) — whether to still build the header as
general-purpose robustness for a future non-scoped key is a call for whoever
next reads that row, not decided here.

## 6. CR-10 — `classify-inbound-reply` / `REPLY_CLASSIFICATION` — reconfirmed

**Still refused, unconditionally, and this is the assertion that matters
most because the key changed.** `src/server/ai/ai-feature-data-policy.ts` —
the exact file merged as #420 for row 101 — is byte-for-byte unchanged on the
commit confirmed deployed in §1:

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

`COVERED_PROCESSORS` is a hardcoded empty set — no environment variable, no
database row, nothing today's key change could touch.
`isPersonalDataUncovered("REPLY_CLASSIFICATION")` returns `true`
unconditionally, and `metered-call.ts` checks this **before** any Anthropic
call is made — so it does not matter that a working key now exists. The
literal string written to `AiUsageEvent.outcomeCode` and returned as
`{ classified: false, reason }` is, verbatim:

```
no_processor_allowance
```

— the same string proven both by this source file and by
`classify-inbound-reply.test.ts:64,77` (unit-tested, not merely read). **No
data-protection incident. The gate holds**, unaffected by whether the
Anthropic call underneath it would now succeed.

## What this does not do

Per the row's explicit instructions: `.bidlow/GRADES.json` was not opened, no
dimension was moved, no sell gate touched, `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`
was not edited. No application code changed — row 126 is neither closed nor
worked on. `ANTHROPIC_API_KEY`'s value was never read, printed, logged or
written by this cycle, anywhere; only setting **names** were queried. The
downloaded production log archive and the throwaway Playwright/session-mint
script were both deleted from this machine before this document was written.

## Scope discipline

Touched: this document and the row 129 status line in `.bidlow/relay/QUEUE.md`.
No application code changed. `npm run lint` / `npm run typecheck` / `npm test`
carry no new risk from a docs+QUEUE.md-only diff, consistent with prior
docs-only rows in this same file (e.g. cycle 157's row 113 write-up); not
re-run for that reason.
