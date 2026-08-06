# Deliverability incident — root cause and fix

**Date:** 2026-08-06
**Author:** BidlowAI (Greg Visser)
**Status:** Root cause confirmed. Fix in progress.

---

## Summary

Outreach emails sent on behalf of client customers were being quarantined and
spam-foldered. **The cause was link misalignment: every outreach email carried links
pointing at a domain unrelated to the sender.**

This was **not** an email-authentication failure. SPF, DKIM and DMARC were passing
throughout. The messages were being filtered on content heuristics, not rejected on
authentication.

---

## The mechanism

Every outreach email contained two links on the OpensDoors application domain, while
the `From:` address was the customer's own domain:

| Link | Source | Points at |
|------|--------|-----------|
| Open-tracking pixel | `buildOpenTrackingPixelUrl()` — `src/lib/tracking/open-pixel.ts:47` | `<app-domain>/api/track/open/<correlationId>` |
| Unsubscribe link | `resolvePublicBaseUrl()` — `src/lib/unsubscribe/one-click-readiness.ts:22` | `AUTH_URL` / `INTERNAL_APP_URL` / `NEXT_PUBLIC_APP_URL` |

An email that claims to come from `@customerdomain.com` but whose only links resolve
to an unrelated host is the textbook phishing pattern. Microsoft Defender, Google and
commercial secure email gateways all weight this heavily.

The codebase already documented the risk. From `open-pixel.ts:33`:

> a hidden 1×1 image on a different host than the sender is a classic
> cold-bulk/phishing signal, and for cold outreach that costs more deliverability
> than the open stats are worth

The mitigation existed but was never enabled — see "Flags" below.

### Direct and secondary effects

- **Direct:** individual messages quarantined or spam-foldered
- **Secondary:** sustained quarantine suppresses engagement and invites spam
  complaints, which degrades the sending mailbox's reputation over time

The second effect is why this presented as "domain damage" even though domain
authentication was never broken.

---

## What was ruled out

| Candidate | Ruled out because |
|-----------|-------------------|
| **SPF failure** | Sending goes through Microsoft Graph (`POST /users/{mailbox}/sendMail`, `src/server/mailbox/microsoft-graph-sendmail.ts:58`) from the customer's own Microsoft 365 tenant. Their existing SPF record already authorises Microsoft's outbound IPs. SPF passes and aligns. |
| **DMARC failure** | DMARC passes if **either** SPF or DKIM aligns. SPF aligns on every send. DMARC passed with or without a published record. |
| **DKIM misalignment** | Exchange Online signs all outbound mail. Without custom-domain DKIM it signs as `<tenant>.onmicrosoft.com`, so DKIM alignment fails — but this is not fatal while SPF alignment carries DMARC. A contributing weakness, not the cause. |
| **Legacy Resend/ESP path** | Would have produced a hard SPF fail on every message. Confirmed not the cause. |
| **Volume / `550 5.1.8`** | Microsoft outbound throttling from cold-mailbox volume. Not the cause here, but the warm-up ramp remains unenabled and is a live exposure — see below. |
| **Signature naming a different company** | A weak spam signal at most. Causes neither quarantine nor reputation damage on its own. |

---

## The fix

**Objective: zero foreign-domain links in outreach email.**

| Step | Change | Type | Status |
|------|--------|------|--------|
| 1 | `OPEN_TRACKING_PIXEL=off` — removes the tracking pixel for all clients | Production config | ✅ **Already live** (verified 2026-08-06) |
| 2 | `mailto:` unsubscribe replacing the hosted link, satisfying the send-governance gate rather than bypassing it | Code | In progress |

Because step 1 was already in place, **step 2 alone closes the root cause.**

After both, an outreach email contains no links to any domain other than the sender's.

### Longer-term alternative

For clients who later want open/click tracking back, the aligned route is a
`go.<customerdomain>` CNAME pointing at the application. Links then sit on a domain
that aligns with the sender and the phishing signal is cleared without removing
tracking. `src/server/clients/link-domain-verification.ts` already implements
verification for this. Treated as an opt-in upsell, not a default requirement.

---

## Production configuration — audited 2026-08-06

Read directly from Azure App Service (`app-opensdoors-outreach-prod`,
`rg-opensdoors-outreach-prod`) via Azure CLI. Secret values were never retrieved —
only setting names, plus the values of non-secret feature flags.

### Deliverability flags — actual production state

| Flag | Production value | Notes |
|------|-----------------|-------|
| `OPEN_TRACKING_PIXEL` | **`off`** | ✅ Already disabled. Half the root-cause fix was already live. |
| `MAILBOX_WARMUP_RAMP` | **`off`** | Explicitly set to off, not merely absent. Not the cause of this incident, but an unmitigated volume exposure. |
| `BOUNCE_SUPPRESSION_ENABLED` | `true` | ✅ |
| `SEND_PREFLIGHT_DEDUP_ENABLED` | `true` | ✅ |
| `MAILBOX_BOUNCE_DETECTION_ENABLED` | `true` | ✅ |
| `MAILBOX_COMPLAINT_DETECTION_ENABLED` | `true` | ✅ |
| `INTERNAL_SEED_ALLOWLIST_ENABLED` | `true` | ✅ |
| `PRE_SEND_PREVIEW_ENABLED` | `true` | ✅ |
| `FOLLOWUP_REQUIRES_SENT_INTRO` | `true` | ✅ |
| `REPLY_THREAD_REF_SENDER_GUARD` | `true` | ✅ |
| `SEND_DISPATCH_RECHECK_ENABLED` | *absent* → off | Optional hardening. |
| `OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN` | *absent* → off | Redundant while the pixel is off. |
| `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN` | *absent* → off | 🔴 **Keep it that way.** See below. |
| `MICROSOFT_MIME_SEND` | *absent* → off | |

**Consequence: with the pixel already off, the unsubscribe link is the ONLY remaining
foreign-domain link in an outreach email.** The `mailto:` change closes the root cause
completely.

### ✅ No dev-bypass flags in production (brief P0-2 — answered)

Verified absent: every `ALLOW_DEV_*` flag, every `OUTBOUND_DEV_*_SECRET`, and
`AUTOPROCESS_OUTBOUND_QUEUE`. The queue drains via the scheduled workflow
authenticated with `PROCESS_QUEUE_SECRET`. **No dev bypass is reachable in
production.**

### ⚠️ `EMAIL_PROVIDER` is unset in production (brief P0-1 — confirmed risk)

`EMAIL_PROVIDER` is **absent** from App Service configuration, so
`src/server/email/providers/index.ts:15` falls through to its default of `mock`.
`RESEND_API_KEY` is also absent.

**Effect:** any `OutboundEmail` row *without* a `mailboxIdentityId` reaches
`MockEmailProvider`, which returns a `mock_<hash>` id and never touches the network —
while the row is recorded as sent.

**Containment:** real client outreach always carries a `mailboxIdentityId` and goes via
Microsoft Graph or Gmail, so it does not use this path. The exposure is limited to
legacy or non-mailbox rows.

**Outstanding — not yet run:** query production for `OutboundEmail` rows with
`providerMessageId LIKE 'mock_%'` created after go-live. Any such row is an email the
system reported as sent and never sent. This requires a production database
credential and has not been performed.

**Recommended fix (Phase 4):** make the provider default fail loudly in production
rather than silently substituting a mock.

### 🔴 `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN` is a send kill switch

`src/lib/clients/client-send-governance.ts:213` returns
`blocked_link_domain_not_aligned` for any real-prospect send where the client has no
verified aligned link domain. No client currently has one configured.

**Enabling this flag halts all outreach sending immediately.** It is named like a
safety improvement and behaves like a full stop. Recorded here because it is a
plausible thing for someone to enable while looking for deliverability fixes.

---

## Verification

Gates run on the current tree before any change:

```
lint       npm run lint     → clean, 0 problems
typecheck  tsc --noEmit     → 0 errors
tests      vitest run       → 1828 passed / 213 files / 0 failed
```

## Evidence basis

- Code paths, flag defaults and the send transport were **verified directly against
  the source** on 2026-08-06 and are cited with file and line above.
- The operational root cause (link/unsubscribe misalignment) was **confirmed by
  Greg Visser** from the incident history.
- No production database query has been run at the time of writing. If a
  quantitative record of affected sends is needed for the client, that remains
  outstanding.
