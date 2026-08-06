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
| 1 | `OPEN_TRACKING_PIXEL=off` — removes the tracking pixel for all clients | Production config | Awaiting approval |
| 2 | `mailto:` unsubscribe replacing the hosted link, satisfying the send-governance gate rather than bypassing it | Code | In progress |

After both, an outreach email contains no links to any domain other than the sender's.

### Longer-term alternative

For clients who later want open/click tracking back, the aligned route is a
`go.<customerdomain>` CNAME pointing at the application. Links then sit on a domain
that aligns with the sender and the phishing signal is cleared without removing
tracking. `src/server/clients/link-domain-verification.ts` already implements
verification for this. Treated as an opt-in upsell, not a default requirement.

---

## Flags

Five deliverability flags default to inactive. Each requires an explicit opt-in value.

| Flag | Effect when enabled | Recommendation |
|------|--------------------|----------------|
| `OPEN_TRACKING_PIXEL=off` | Removes the tracking pixel for all clients | **Enable** — half of the root-cause fix |
| `MAILBOX_WARMUP_RAMP=on` | New mailboxes ramp from 5/day toward their configured cap | **Enable** after a stable window — not the cause here, but an unmitigated exposure |
| `SEND_DISPATCH_RECHECK_ENABLED=on` | Adds dispatch-time cooldown and a hard-bounce backstop | Enable after the above are stable |
| `OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN=on` | Pixel only for clients with a verified aligned domain | Redundant once `OPEN_TRACKING_PIXEL=off` |
| `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN=on` | 🔴 **Blocks every real-prospect send** for any client without a verified `go.<domain>` | **Do not enable.** See below |

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
