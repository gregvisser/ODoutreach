# Row 147 — dispatch-time cooldown/bounce re-check enabled in production

**Date:** 2026-08-31 · **Cycle:** 205 · **Type:** config-only change to Azure
App Service settings. No code, schema, or test changed the send behaviour —
`SEND_DISPATCH_RECHECK_ENABLED` and `dispatch-recheck.ts` were built and
tested by an earlier engagement (see M2/M3 in the file's own comments) and
raised as this row by row 134 (cycle 192), finding 4 — read
`docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md` for the original
evidence.

## What this flag does

`src/server/email/outbound/dispatch-recheck.ts` re-checks the 10-day
workspace-wide send cooldown, and a hard-bounce backstop, at the moment a
queued email is actually dispatched (`execute-one.ts:277-302`) — not just
when it was originally planned. Before this change, a row that sat `QUEUED`
for a long retry backoff, or was manually held and sent later, could leave
without that final check; suppression/DNC/unsubscribe were already
unconditionally re-checked at dispatch, cooldown was the one exception. The
planner-time cooldown check (`step-sends.ts`) was never in question and
remains unconditional — this closes the one remaining gap for long-queued
rows.

## Before

- `SEND_DISPATCH_RECHECK_ENABLED` — **absent** from production App Service
  config, confirmed via `az webapp config appsettings list --name
  app-opensdoors-outreach-prod --resource-group rg-opensdoors-outreach-prod
  --query "[?name=='SEND_DISPATCH_RECHECK_ENABLED']"` → `[]` (empty — matches
  `isDispatchRecheckEnabled()`'s off-when-unset default, and matched
  `docs/ROADMAP-2026-08.md`'s "off" note, now corrected).
- Recommended order from the earlier deliverability engagement
  (`docs/ROADMAP-2026-08.md:262-264`, Phase 0): findings doc → enable
  `MAILBOX_WARMUP_RAMP` → a stable window → then enable
  `SEND_DISPATCH_RECHECK_ENABLED`. Checked before flipping this flag:
  `MAILBOX_WARMUP_RAMP` is already `on` in production, and
  `BOUNCE_SUPPRESSION_ENABLED` is already `true` — both confirmed via the
  same `az webapp config appsettings list` command. The prerequisite ordering
  is satisfied; the roadmap doc itself is dated 2026-08-06, so the "stable
  window" since `MAILBOX_WARMUP_RAMP` went on is measured in weeks, not days.
- Row 134's own audit (2026-08-31, cycle 192) independently recommended
  flipping this flag now — "this is a config change, not new work" — and this
  row exists to carry that recommendation out.

## Verification before the flip

Ran the full `src/server/email/outbound/` test suite (13 files, 199 tests) —
green, including `dispatch-recheck.test.ts` (11 tests: pure-decision logic,
the flag reader itself, `loadDispatchRecentSend` DB behaviour, and a
source-contract test asserting `execute-one.ts` calls the recheck only behind
the flag, after suppression). No test needed changing — the suite already
covers both flag states (`isDispatchRecheckEnabled` "off when unset" /
"on only for the literal 'true'").

```
✓ src/server/email/outbound/dispatch-recheck.test.ts (11 tests)
✓ src/server/email/outbound/execute-one-*.test.ts (7 files, 61 tests)
✓ src/server/email/outbound/execute-one.integration.test.ts
... (13 files total)
Test Files  13 passed (13)
     Tests  199 passed (199)
```

## The change

```
az webapp config appsettings set --name app-opensdoors-outreach-prod \
  --resource-group rg-opensdoors-outreach-prod \
  --settings SEND_DISPATCH_RECHECK_ENABLED=true
```

## After

- `az webapp config appsettings list ... --query "[?name==
  'SEND_DISPATCH_RECHECK_ENABLED']"` → `{"name":
  "SEND_DISPATCH_RECHECK_ENABLED", "slotSetting": false, "value": "true"}`.
- Setting an App Service config value restarts the app; this is a config
  restart, not a redeploy — no new build was pushed. Confirmed the app came
  back on the **same** commit it was already running, via the direct App
  Service URL (never the CDN-cached custom domain):
  - `GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/health` →
    `200`
  - `GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info`
    → `{"service":"opensdoors-outreach","version":"0.1.0",
    "nodeEnv":"production","commit":"6f6cceb...","buildTimestamp":
    "2026-08-31T18:19:18Z"}` — `6f6cceb` matches `main`'s current head
    (`6f6cceb docs(state): row 146 - record cycle 204 session in STATE.md
    (#522)`) at the time of this change, confirming this was purely a
    settings restart, not a redeploy of different code.
- Re-ran the same test suite after the flip for parity — still green, 13
  files / 199 tests. (The suite exercises the flag directly via
  `process.env`, so its result does not depend on the Azure setting; this
  re-run is a belt-and-braces repeat, not a different code path.)

## Docs corrected

`docs/ROADMAP-2026-08.md`'s "Deliverability flags currently OFF" table
(around line 87-96) said `SEND_DISPATCH_RECHECK_ENABLED off` and
`MAILBOX_WARMUP_RAMP off` — both stale (`MAILBOX_WARMUP_RAMP` was already
`on` in production before this row started). Updated that block to the
current, verified state and pointed at this artefact. The later narrative
references to the recommended flag order (`:263-264`, `:445`) are historical
description of a plan that is now complete and were left as-is — they are
accurate as a record of the sequencing decision, not as a live status claim.

## What this does NOT do

- No code changed. `dispatch-recheck.ts` and its wiring in `execute-one.ts`
  were already merged and tested by an earlier engagement; this row only
  flips the runtime switch that was already built for this purpose.
- No migration, no client data touched, no email sent by this row itself.
  This flag makes the send pipeline **more** conservative — it can only add a
  block (recent bounce / cooldown) at the moment of dispatch, never bypass an
  existing check. It cannot cause the hard rule's line to be crossed for any
  client other than `bidlowai`, because it never causes a send; it can only
  prevent one that suppression/DNC/cooldown checks would already have
  intended to prevent had the row been re-planned instead of dispatched from
  a stale queue position.
- No `.bidlow/GRADES.json`, dimension, or sell-gate score touched, per the
  row's own instruction.

## Hard rule compliance

No email sent, no client data touched or deleted, by this row. The only
production system touched was the App Service configuration flag itself
(infrastructure, not client data), and the only files changed were this
artefact, `docs/ROADMAP-2026-08.md`, and `.bidlow/relay/QUEUE.md`.
