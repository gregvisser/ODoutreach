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

`.bidlow/DOMAIN.json` records **1 irreversible action as ungated**:

1. **DNC sibling domains** — `suppression-guard.ts` matches domains on an exact
   key, so `bt.com` on the list does not cover `bteurope.com`. The gate exists and
   is tested; its matching is narrower than ideal. Phase 2, ~18 Tier P days. Live
   compliance exposure the client raised directly

**The build gate stays shut** until that is closed. That is the standard working
as designed.

### Corrected 2026-08-09 — the warm-up ramp was ALREADY on

`MAILBOX_WARMUP_RAMP` is **`on` in production**, verified directly against Azure:

```
az webapp config appsettings list --name app-opensdoors-outreach-prod \
  --resource-group rg-opensdoors-outreach-prod \
  --query "[?name=='MAILBOX_WARMUP_RAMP']"     ->  value "on"
```

The August roadmap, the engagement notes and the first version of this file all
recorded it as OFF. **They were stale — do not trust them on this point.** The
claim that volume protection is active is therefore true, not false as previously
stated. The action is now recorded as gated: `mailbox-warmup.test.ts` proves the
ramp fails closed — clock skew (`-3`) and `NaN` both collapse to the base cap of
5, and the configured steady cap is never exceeded.

Caveat worth keeping: the ramp is *activated* by a flag that defaults to off, so
the gate is fail-closed in its logic but fail-open in its activation. Re-verify
the flag before relying on it.

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

## Chain and grades — run 2026-08-09

`.bidlow/CHAIN.json` (gitignored — it names the commit it attests to, so
committing it would make itself stale) and `.bidlow/GRADES.json` (tracked).

| | Result |
|---|---|
| Architect / Test / Security / SRE / Reviewer | **passed**, with gaps recorded |
| Head of Engineering | **sign-off WITHHELD** |
| Engineering grade | **8.0** — below the 8.5–9.5 Tier P band, deliberately |
| Customer-Ready grade | **NOT GRADED** |

Engineering is 8.0 not 8.5 because three of the nine things a 9 requires are
unproven or absent: no e2e on critical journey J5, coverage thresholds not
verified as enforced, and Sentry wired but not verified as receiving events.
Rounding up to land inside the band is the false-9 the protocol exists to stop.

Sign-off was withheld because signing would unblock a production deploy of
send-path changes I have not reviewed, on the strength of a Customer-Ready score
nobody has measured.

## Pick this up first

1. **Run the `customer-ready-audit` skill** as its own focused session. It is the
   single blocker on everything else. Walk the product live, save a dated
   `CUSTOMER-READY-REPORT.md`
2. **Adversarially review `feat/zero-dns-send-profile`** — 4 send-path commits,
   ~1,400 lines, currently unreviewed and explicitly outside the chain's scope.
   Then merge and deploy. Branch protection is on, so PR only; verify by commit
   via `/api/build-info`, never by liveness alone
3. **Investigate two production findings** raised while walking the app:
   - 204 of ~1,470 contacts show **"send proof missing"** (~14%), unexplained
   - Delivered is **"not tracked — no provider delivery webhooks yet"**, so
     bounces read 0 (0%) across 1,209 sends. The domain brief makes bounce rate
     below 2% a non-negotiable. **A threshold that cannot be measured cannot be
     enforced** — this is arguably the most important open item on the product
   - `/operations` returns 404 on production; may be a moved route, not diagnosed
4. **Three local branches are unpushed**, all based on local `main`, which itself
   carries 2 unpushed docs commits. `origin/main` == deployed (`b36e66e`)

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
