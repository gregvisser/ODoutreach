# Phase 3 — Verification & Manual QA

**Branch:** `chore/prod-hardening` · **commit:** `e9be876` · **not pushed, not deployed.**

## Automated verification
| Gate | Before | After |
|---|---|---|
| Vitest | 195 files / 1537 tests green | **199 files / 1551 tests green** (+14 new) |
| `tsc --noEmit` | clean | **clean** |
| ESLint | clean | **clean** |
| `npm run build` (webpack) | — | **green** (new `/settings/internal-seed` route compiled; Outreach route OK) |

New tests: seed policy (4), seed gate exemption (3), seed no-auto-suppress (4), preview↔send parity (3).

## What changed (all additive, both flags default OFF)

**Feature A — internal seed / allowlist** (`INTERNAL_SEED_ALLOWLIST_ENABLED`)
- New table `InternalSeedAddress` (migration `20260625120000_internal_seed_addresses`, seeds the 6 `@opensdoors.co.uk` addresses).
- `evaluateSuppression` exempts active seed addresses (always deliverable) — the single send-time chokepoint, so every send path is covered.
- `suppressRecipientForHardBounce` (bounce **and** complaint) no-ops for seeds; the refresh/import cleaning path is covered by the gate exemption.
- Seed addresses excluded from reputation-sensitive OutboundEmail analytics.
- Super-admin UI at `/settings/internal-seed`, flagged "Internal test address".

**Feature B — pre-send preview** (`PRE_SEND_PREVIEW_ENABLED`)
- Shared `renderOutreachEmail` reuses the exact send primitives (no parallel renderer); parity test asserts preview == send render.
- Flag-gated panel on the Outreach page renders the final HTML in a `sandbox=""` iframe.

## Residual risks / honest caveats
1. **Migration not applied anywhere yet.** The local dev DB rejects creds (known), so the table was verified via `prisma validate` + `generate` + full build/test, **not** a live apply. **Apply on staging first** (`prisma migrate deploy`), then prod as a deliberate, confirm-first step. Rollback: `DROP TABLE "InternalSeedAddress";` (no inbound FKs).
2. **Seed gate adds one indexed query per `evaluateSuppression` when the flag is ON** (plan/dispatch/send + per-contact during refresh). Fine at current volume; batch later if a tenant has very large lists. Zero cost when OFF (no query).
3. **DNC Google-Sheet sync** could still *write* a `SuppressedEmail` row for a seed address if someone puts it on a client's sheet — but the gate exemption keeps the seed **deliverable regardless**, so the always-deliverable invariant holds. (Bounce/complaint/refresh/import are fully guarded.)
4. **Phase-1 audit findings are NOT fixed** — only the two features were built, per the stop-and-review instruction. The HIGH items (one-click 405, no bounce/complaint capture, double-send, follow-up-after-failed-intro) remain open and await your go-ahead.
5. Feature B's preview uses a **sample** recipient + a sample unsubscribe token by default; it reflects rendering exactly, not a live token.

## Manual QA checklist (staging)
**Pre-req:** apply the migration on staging; set `INTERNAL_SEED_ALLOWLIST_ENABLED=true` and `PRE_SEND_PREVIEW_ENABLED=true` on staging only.

**Feature A — seed allowlist**
- [ ] `/settings/internal-seed` (as owner) lists the 6 seeded addresses, each flagged "Internal test address". Non-owner sees the "owner only" notice.
- [ ] Add a new address via the form → appears Active. Deactivate → shows Inactive.
- [ ] Add a seed address to a test client's DNC / mark it bounced via the dev simulate-provider-event route → confirm it is **NOT** added to suppression and the contact is **not** flagged suppressed.
- [ ] Attempt a governed test send to a seed address that is on a suppression list → it is **delivered** (gate exempt), not BLOCKED_SUPPRESSION.
- [ ] Reports/metrics for a client: a send to a seed address does **not** increment sent/bounce/open counts.
- [ ] Flip the flag OFF → confirm the gate behaves exactly as before (seed address with a suppression row is blocked again).

**Feature B — pre-send preview**
- [ ] Outreach page shows the "Pre-send preview" card (flag on). Pick a sequence + step → "Generate preview" renders the email in the iframe with merge fields resolved and the mailbox's branded signature + unsubscribe footer.
- [ ] **Parity check (the important one):** send a **real test from the client identity to a seed address** (now safely always-deliverable), open the received email, and confirm it **matches the preview** byte-for-byte (subject, body, signature, footer).
- [ ] Flip the flag OFF → the preview card disappears; Outreach page unchanged.

## Recommended config-only quick-wins (from the Phase-1 audit, no code)
- [ ] `SEND_PREFLIGHT_DEDUP_ENABLED=true` in prod — mitigates the HIGH double-send (H4).
- [ ] Set `INBOUND_WEBHOOK_SECRET` in prod if unset — closes the unauthenticated reply-injection hole (M10).
