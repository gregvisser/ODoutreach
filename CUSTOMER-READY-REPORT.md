# Customer-Ready Report — OpensDoors Outreach

**Date: 2026-08-09 · Tier P (Client Production) · Audited by walking production live**

# Customer-Ready 4.0/10 — Not customer-ready

# Engineering 8.0/10 — see `.bidlow/GRADES.json`

**Sell gate (Engineering ≥ 8 AND Customer-Ready ≥ 8): NOT SATISFIED.**

Walked as a signed-in operator against live production (`opensdoors.bidlow.co.uk`,
serving commit `b36e66e` built 2026-07-20). The "customer" here is an OpensDoors
staff operator, since that is who uses the product.

> **The weighted rubric score was 6.0.** It is reported as **4.0** because a hard
> cap applies — see "The cap, and why" below. Both numbers are shown so the
> judgement can be challenged.

---

## The finding that decides this grade

**Production still puts unsubscribe links on the OpensDoors app domain.** That is
the phishing pattern that caused the quarantine incident.

The deployed commit contains, at `src/server/email-sequences/send-introduction.ts:529`:

```ts
const publicBaseUrl = resolveClientLinkBaseUrl(client) ?? resolvePublicBaseUrl();
```

No client has a verified aligned link domain (established in the 6 August audit),
so `resolveClientLinkBaseUrl` returns null and it falls through to
`resolvePublicBaseUrl()` — which is `AUTH_URL` = `https://opensdoors.bidlow.co.uk`.
Every outreach email therefore carries a link on the OpensDoors domain while its
`From:` is the customer's own domain.

**The other half of the root cause IS fixed:** `OPEN_TRACKING_PIXEL=off` is set in
production, verified directly against Azure App Service config today. There is no
tracking pixel.

**The unsubscribe fix exists but is not deployed.** Commit `a8d777c` removes the
app-domain fallback entirely. It sits on the unmerged branch
`feat/zero-dns-send-profile`. It is in git, not in production.

So: of the two link-alignment defects behind the incident, **one is fixed and live,
one is fixed and unshipped.**

---

## Scorecard

| # | Dimension | Wt | Score | What I actually observed |
|---|-----------|:--:|:-----:|--------------------------|
| 1 | Core journeys end-to-end | 18 | **3** | Mail sends and 1,209 sends carry provider proof, but production still mints app-domain unsubscribe links — the defect that got mail quarantined. The workspace also contradicts itself on send state (see #5) |
| 2 | Nothing half-built in the path | 12 | **5** | `/operations` returns a raw 404. `/clients/{id}/activity` redirects silently back to the overview instead of showing activity. The **Campaigns** column reads `0` for all 17 clients, including ones with 463 and 647 contacts |
| 3 | No dev-isms / internal leakage | 10 | **9** | Genuinely clean. Friendly status pills ("Active", "Onboarding"), "Workspace ID train-hugger" rather than "Slug", no raw enums or cuids in visible copy. The June de-jargoning pass clearly held |
| 4 | Professional polish & UX | 12 | **8** | Strong. Numbered setup workflow, a real "Launch readiness" panel with per-section metrics, an excellent danger zone that states exactly what delete does and does not touch and requires typing the workspace name. Minor: the PWA install card overlays the last rows of the clients table on desktop |
| 5 | Copy & clarity | 8 | **6** | Mostly plain and accurate — the reporting page even states its own methodology ("live counts, no rollup tables"). But the Train Hugger workspace says **"LATEST ACTIVITY — No sends yet"** and **"Activity — not started"** while the reporting page shows **743 sends** for that same client. An operator is shown two different truths |
| 6 | Onboarding / first-run | 10 | **7** | The 7-step workflow with per-step completion is genuinely good guidance. Not verified against a brand-new empty client, so partly unproven |
| 7 | Error handling & resilience | 10 | **5** | Largely **unproven** — I did not test bad input, expired sessions or permission failures. What I did see: `/operations` gives an unbranded framework 404, and a bad sub-route redirects silently rather than explaining |
| 8 | Data safety & trust | 10 | **7** | Auth held, no cross-customer leakage seen, tenant isolation tests exist in the codebase, owner-only tools were confirmed hidden from staff in a prior pass. Marked down because trust in the *numbers* is damaged by #5 |
| 9 | Reliability & operability | 6 | **6** | `/api/health` returns `{ok:true, database:ok}`, Sentry is wired, `docs/TEAM_RUNBOOK.md` exists. But delivery is **"not tracked — no provider delivery webhooks yet"**, so bounces read 0 across 1,209 sends |
| 10 | Commercial mechanics | 4 | **6** | Workspace creation, staff access, soft-delete with 30-day recovery all present and working. ToS / privacy policy not checked |

**Weighted total: 5.98 → 6.0**

### The cap, and why

**Applied: "core customer journey is broken / not functional → cap 4.0."**

This is a judgement call and worth stating openly. The send journey is not
*mechanically* broken — mail leaves and gets provider proof. It is applied because
the core job the customer buys is *reaching inboxes*, and production currently
reproduces the exact defect that got their mail quarantined and nearly ended the
relationship. A journey that completes while defeating its own purpose is not a
working journey from the customer's side.

If you disagree with the cap, the honest uncapped number is **6.0 — "Demo-able,
not sale-ready"**. Either way it is below 8, so the sell gate is unsatisfied and
the required actions are identical.

---

## Top blockers

1. **App-domain unsubscribe links in production.** The root-cause fix is written,
   tested and unmerged. Highest impact, and the cheapest of the big fixes.
2. **The workspace contradicts the reporting page on send history.** "No sends
   yet" against 743 recorded sends. Operators cannot trust what they are shown,
   and this is the kind of thing that erodes confidence fastest.
3. **Bounce rate is unmeasurable.** No delivery webhooks, so bounces read 0% over
   1,209 sends. The domain brief makes "bounce rate below 2%" a non-negotiable —
   a threshold you cannot measure is a threshold you cannot enforce. Silent 0% is
   worse than a visible "unknown", because it reads as a clean bill of health.
4. **204 of ~1,470 contacts show "send proof missing"** (~14%), unexplained.
5. **Dead-ish surfaces:** `/operations` 404s, `/clients/{id}/activity` silently
   redirects, Campaigns always reads 0.
6. **Google OAuth app remains in Testing mode** — Google mailboxes need
   reconnecting roughly weekly. Known, accepted, recurring operator friction.

## Fix-to-ready checklist — ordered, cheapest-highest-impact first

1. **Review, merge and deploy `feat/zero-dns-send-profile`.** Removes blocker 1.
   ~1,400 lines across the send path, currently unreviewed — review it properly
   first. Verify by commit via `/api/build-info`, never liveness alone.
2. **Reconcile the workspace "latest activity" query with the reporting query.**
   One of them is wrong; find out which. Small fix, large trust payoff.
3. **Show "not measured" instead of 0 for bounces and opens** wherever delivery
   webhooks are absent. Copy-only change that stops a false clean reading, and it
   can ship before real bounce tracking exists.
4. **Diagnose the 204 proof-missing sends.** Decide whether they are failures,
   stale rows, or a reporting artefact, then either fix or label them.
5. **Fix `/operations` and `/clients/{id}/activity`;** hide or populate the
   Campaigns column.
6. **Give the app a branded 404** rather than the framework default.
7. **Publish the Google OAuth app** to end the weekly reconnect cycle — previously
   declined; worth revisiting now it is a standing operator cost.

## What I did NOT check — cover these next pass

- A brand-new / empty client workspace (first-run from zero)
- Error paths: bad input, expired session, a permission a staff user shouldn't have
- Mobile / responsive rendering
- The Brief, Templates, Lists, Sources and Do-not-contact tabs
- Actually sending a test message end-to-end
- ToS / privacy policy presence
- Whether Sentry is receiving events in production

---

**Re-date this report after each readiness pass.** Grades expire; the ship gate
treats anything over 90 days old as stale.
