# STATE — OpensDoors Outreach

**Updated 2026-08-09 · Tier P (Client Production) · branch `feat/zero-dns-send-profile`**

## Where the build actually is

`/bidlow-init` was run on an existing, live, deployed product — not a new repo.
Most foundations already existed; the missing ones were laid this session. No
source files were changed.

### Laid this session

| File | Why |
|---|---|
| `.gitattributes` | Was absent. Non-negotiable #5, `* text=auto eol=lf` |
| `CLAUDE.md` line 1 | Tier P declared. Was absent, which is why the build gate was shut |
| `SCOPE.md` | Tier P requires it. Written from the August roadmap and engagement notes |
| `CUSTOMER-READY-REPORT.md` | Was referenced by `CLAUDE.md` but did not exist — a dangling reference blocks the gate. Created as an explicit NOT YET GRADED record, not a pass |
| `.bidlow/DOMAIN.json` | The machine-readable brief the gate reads. The prose brief existed; this did not |
| `.bidlow/STATE.md` | This file |

### Gates run and their real output, 2026-08-09

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **exit 0**, no problems |
| Typecheck | `npm run typecheck` | **exit 0**, no errors |
| Tests | `npm test` | **1852 passed / 213 files**, 10.2s |
| Build | `npm run build` | **NOT RUN** this session |
| e2e | `npm run test:e2e` | **NOT RUN** this session |

## What is half-done, and exactly where

**The zero-DNS send profile is committed but NOT merged and NOT deployed.**
Branch `feat/zero-dns-send-profile` sits 4 commits ahead of `main`:

- `36a1fdf` mailto opt-out rail + rail resolver
- `83b7170` site-wide cross-domain link audit
- `c6a4a83` visible opt-out on the mailto rail
- `a8d777c` **the root-cause fix** — stop minting unsubscribe links on the app domain

This is the days 5–9 work of a 9-day August window with zero slack. Until it
merges and deploys, the incident's root cause is fixed in git and not in
production.

## The one finding that came out of this session

**A prospect send with no `mailboxIdentityId` would be silently mock-"sent".**

`src/server/email/outbound/execute-one.ts:210` routes on `if (row.mailboxIdentityId)`.
Rows without it fall to `getOutboundEmailProvider()`, which defaults to
`MockEmailProvider` when `EMAIL_PROVIDER` is unset — and it is unset in
production. `MockEmailProvider.send()` returns a synthetic `{ ok: true }`, so the
row would be marked SENT, the contact marked contacted, and follow-ups would fire
referencing an intro email the recipient never received.

It has **never fired** — the 6 August Phase 0 audit found zero `mock_` rows. It is
latent, not active. It is also genuinely ungated, and it is the exact defect class
the standard names: *a provider that quietly falls back to a mock when
unconfigured*. Already on the roadmap inside Phase 4.

**This is why the build gate is still shut.** It is recorded honestly in
`.bidlow/DOMAIN.json` under `irreversible_actions` rather than rounded up.

## Pick this up first

1. **Decide on the mock-fallback guard** (below). It opens the build gate and
   closes a real "claim a send that did not happen" defect. Small: a runtime
   refusal in `execute-one.ts` plus a fail-closed test.
2. **Merge and deploy `feat/zero-dns-send-profile`** via PR — branch protection is
   on, `git push origin main` is refused. Verify by commit via `/api/build-info`,
   never by liveness alone.
3. **Decide `MAILBOX_WARMUP_RAMP`.** It is off, so the graduated warm-up is inert.
   The flat 30/day cap still applies. A client email has claimed volume protection
   is active; that is not true while this is off.

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

Four, carried in `.bidlow/DOMAIN.json` under `open_questions`, plus the
NEEDS CONFIRMATION items in `SCOPE.md`.
