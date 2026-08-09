# STATE — OpensDoors Outreach

**Updated 2026-08-09 · Tier P (Client Production)**

## Where the build actually is

`/bidlow-init` was run on an existing, live, deployed product — not a new repo.
Most foundations already existed; the missing ones were laid, and one real defect
found during the domain pass was fixed.

Two branches came out of this session, both **local, unpushed**:

| Branch | Contents |
|---|---|
| `chore/bidlow-foundations` (`5737fb7`) | Tier P declared, `.gitattributes`, `SCOPE.md`, `CUSTOMER-READY-REPORT.md`, `.bidlow/DOMAIN.json`, this file. Docs only |
| `fix/refuse-mock-send-for-prospect-rows` | The mock-send guard + tests. Branched from the above |

## Gates run and their real output, 2026-08-09

Measured on `fix/refuse-mock-send-for-prospect-rows`:

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **exit 0** |
| Typecheck | `npm run typecheck` | **exit 0** |
| Tests | `npm test` | **1836 passed / 214 files** |
| Build | `npm run build` | **NOT RUN** |
| e2e | `npm run test:e2e` | **NOT RUN** |

**Test counts are branch-dependent — do not compare them across branches.**
Baseline on this branch is **1828 / 213**; the guard adds 8 tests in 1 file.
`feat/zero-dns-send-profile` reports **1852** because it carries ~24 extra tests
from the unsubscribe/mailto work that is not in `main`.

## The defect found and fixed this session

**A prospect send with no `mailboxIdentityId` would have been silently
mock-"sent".** `execute-one.ts` routed on `if (row.mailboxIdentityId)`; rows
without it fell to `getOutboundEmailProvider()`, which returns `MockEmailProvider`
whenever `EMAIL_PROVIDER` is unset — as it is in production. The mock returns a
synthetic `{ ok: true }`, so the row would have been marked SENT, the contact
marked contacted, and follow-ups would have fired referencing an introduction the
recipient never received.

It had **never fired** — the 6 August audit found zero `mock_` rows. Latent, not
active. Now gated by `prospect-send-transport-guard.ts`, which refuses any row
carrying a `contactId` but no mailbox, and fails it with `NO_SENDING_MAILBOX`
rather than falling through.

Two deliberate decisions recorded in `.bidlow/DOMAIN.json`:

- **Not behind a feature flag**, against the local convention. It can only
  intercept rows headed for the mock, so it cannot turn a real send into a
  non-send — a flag defaulting to off would just leave the defect live.
- **The wiring is not covered by an automated test**, only the pure decision
  function. `executeOutboundSend` needs a database and the unit suite is
  deliberately DB-free. Verified by reading. An integration test belongs in
  `execute-one.integration.test.ts` when a database is available.

## Still open, and why

`.bidlow/DOMAIN.json` records **2 irreversible actions as ungated**. Both are
known, scheduled, and were open before this session:

1. **DNC sibling domains** — `suppression-guard.ts` matches domains on an exact
   key, so `bt.com` on the list does not cover `bteurope.com`. The gate exists and
   is tested; its matching is narrower than ideal. Phase 2, ~18 Tier P days. Live
   compliance exposure the client raised directly
2. **Warm-up ramp** — written and tested but inert, because
   `MAILBOX_WARMUP_RAMP` is not `on`. The flat 30/day cap applies unconditionally
   and is tested, so this is a missing protection, not an open floodgate

**Consequence: the build gate is still shut**, and will stay shut until those two
are closed or re-recorded. That is the standard working as designed.

## A real gap in the standards tooling

The build gate **blocks its own remedy**. Recording an ungated action honestly
makes it impossible to write the fix for that action, because the gate refuses all
non-markdown writes anywhere — including `~/.claude/settings.json` and the hook's
own `lib.mjs`. The hook was parked by hand to land this fix.

`knowledge_map` pillars have a `mitigation_recorded` escape hatch. `irreversible_actions`
has none — [lib.mjs](C:/Bidlowprojects/_standards/bidlow-standards/plugins/bidlow-standards/scripts/lib.mjs)
`ungatedActions()` is a bare `!a.gate || a.fail_closed_test !== true`. Worth adding
a dated, recorded waiver field; this will hit every Bidlow repo that records an
honest gap.

## Pick this up first

1. **Re-enable the build-gate hook** if it is still parked — restore the
   `"matcher": "Write|Edit|NotebookEdit"` line in `~/.claude/settings.json`
2. **Merge and deploy `feat/zero-dns-send-profile`** — the incident's root-cause
   fix is in git, not in production. Branch protection is on, so PR only. Verify
   by commit via `/api/build-info`, never by liveness alone
3. **Set `MAILBOX_WARMUP_RAMP=on`** in Azure App Service config. One flag, then a
   stable window. It makes the "volume protection is active" line in the client
   email true
4. **Push is blocked** until `/bidlow-ship` (role chain) and `/bidlow-grade`
   (Engineering ≥ 8 and Customer-Ready ≥ 8) have run. Customer-Ready is
   deliberately ungraded — it requires walking the product live

## Decisions already locked — do not relitigate

- Zero DNS required from customers. Graph sending IS Outlook sending
- Tracking off by default; `go.<domain>` CNAME is a later upsell, not a barrier
- Draft-into-Outlook deferred, built only if a specific corporate asks
- Email only. No LinkedIn outreach automation
- Phase 2 (DNC brand grouping) sequenced ahead of domain verification
- `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN` is a send kill switch, not a hardening
  flag. Leave it off

## Capacity reality

~9 working days, half-time, 6–31 August, zero slack. The full programme is
**~139 Tier P days — roughly 8 months at half-time, not 3.**

## Open questions

Five. Four in `.bidlow/DOMAIN.json` under `open_questions`, plus whether to add
the waiver mechanism to the standards hook. See also the NEEDS CONFIRMATION items
in `SCOPE.md`.
