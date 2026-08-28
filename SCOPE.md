# SCOPE — OpensDoors Outreach

**Tier P (Client Production) · written 2026-08-09 · engagement opened 2026-08-06**

Client: **OpensDoors**. Supplier: **BidlowAI (Greg Visser)**.

This document records what was agreed, what was explicitly excluded, and what is
still unconfirmed. Items marked **NEEDS CONFIRMATION** were inferred from the
roadmap and engagement notes and have not been confirmed back to Greg in this
session. They are not agreements until they are.

Source material: `docs/ROADMAP-2026-08.md` and
`docs/audits/2026-08-06-deliverability-root-cause.md` (both on branch
`chore/deliverability-findings`), and `DOMAIN-BRIEF-cold-email.md`.

---

## 1. Business outcome, in the client's own words

> "A working system by end of August."

That phrase is dangerously unpinned and the roadmap says so explicitly: the
system already works, so the sentence will otherwise be judged against whatever
the client imagined. It was pinned to four specific things:

- Corporate customers can be connected and sent from, **with no DNS changes**
- Sending goes from the customer's own mailbox, tracking off, with nothing in the
  message that can read as phishing
- Volume protection active on every new mailbox from day one
- Deliverability review findings delivered

**NEEDS CONFIRMATION — this pinning was to be agreed in writing with the client
before starting. Whether that written agreement happened is not recorded.** If it
did not, it is the single highest-value thing to do before 31 August.

### The commercial context

OpensDoors was **on the verge of cancelling** after the deliverability incident.
The engagement's real outcome is not a feature — it is that the client keeps the
supplier. That reframes priority: the work that removes their stated objection
beats the work that is better engineering.

---

## 2. Critical journeys

These get e2e tests. Breaking one is an incident, not a bug.

| # | Journey | e2e status (verified 2026-08-09) |
|---|---------|----------------------------------|
| J1 | Staff sign in via Entra ID; anonymous users are redirected to sign-in with a callback | **Covered** — `e2e/sign-in.spec.ts` |
| J2 | Staff role boundaries hold: non-super-admin is refused admin operations | **Covered** — `e2e/journeys.spec.ts` |
| J3 | Outbound email detail renders routing and timeline; unknown id is not found | **Covered** — `e2e/journeys.spec.ts` |
| J4 | Compose sheet opens **without sending** | **Covered** — `e2e/journeys.spec.ts` |
| J5 | **Enrol → launch → send → reply ingested → opt-out honoured** | **Covered end-to-end (2026-08-27)** — `src/server/email-sequences/j5-journey.integration.test.ts` |

**J5 is the product.** It is the journey that touches a real third party's inbox,
and it was the last one without end-to-end coverage. It now has a single test
that walks one prospect through all five stages against a real database, with the
mailbox transport **captured** rather than connected.

**Why it is an integration test rather than a Playwright spec.** The `e2e/` suite
deliberately makes a real send impossible — `e2e/env.ts` blanks every provider
credential. Letting a browser test "send" would mean weakening that, trading a
real safety guarantee for a cosmetic one. Capturing the transport instead needs a
module boundary that a built production server does not expose, so the journey
runs where that boundary exists. The browser-observable ends of the journey stay
covered by `e2e/`. This was a deliberate departure from the brief for queue item
9, which asked for a Playwright journey; the reason is recorded here rather than
worked around.

**It was proven capable of failing**, not merely observed to pass — the two joins
it exists to protect were broken in the product on 2026-08-27 and each turned the
test red: a planner that ignores `Contact.isSuppressed` (an opt-out recorded but
never read), and an inbound matcher that stops linking a reply to its contact.

It runs in CI on every push: `.github/workflows/ci.yml` → job `e2e` → step
"Integration tests" (`npm run test:integration`), against a real PostgreSQL
service, with no `continue-on-error`. Note that `npm test` does **not** run it —
`vitest.config.ts` excludes `**/*.integration.test.ts` by design.

---

## 3. In scope — August 2026

Capacity is **~9 working days, half-time, 6–31 August**. Phases 0 and 1c as
originally scoped needed 13 Tier P days, so Phase 1c was trimmed to fit. There is
**zero slack**.

| Days | Work | Standalone value if everything after slips |
|------|------|--------------------------------------------|
| 1–4 | Phase 0 — forensic root cause, flag audit, warm-up ramp on, findings doc | Evidence delivered, likely root cause fixed |
| 5–6 | Tracking off by default | The phishing signal is gone |
| 7–9 | `mailto:` unsubscribe + send-governance gate | Corporate onboarding unblocked |

Every stopping point is shippable, so a slip is a soft landing rather than a
missed deadline.

### Status against that plan, as at 2026-08-09

Branch `feat/zero-dns-send-profile` carries the days 5–9 work and is **committed
but not merged and not deployed**:

- `36a1fdf` — mailto opt-out rail and rail resolver
- `83b7170` — site-wide cross-domain link audit
- `c6a4a83` — visible opt-out on the mailto rail
- `a8d777c` — **the root-cause fix**: stop minting unsubscribe links on the app
  domain

---

## 4. Out of scope — the important section

Everything here has been said "we could do that later" about. Nothing in this
list is committed, and none of it should be started without a scope change.

### Explicitly deferred, with a recorded reason

| Item | Why it is out |
|------|---------------|
| **Draft-into-Outlook mode** | The premise died. It was requested because corporates would not accept the system sending on their behalf; the zero-DNS finding removes that objection. OpensDoors staff would be the reviewers either way, so it adds **no actual safety** — optics only. Roughly a week at Tier P. **Build only if a specific corporate asks.** This is a change from the roadmap's first draft, which committed to it in Week 8 |
| **LinkedIn / social outreach automation** | Decision: **email only**. Carries platform terms-of-service risk |
| **The `ALIGNED_DOMAIN` opt-in tracking mode** | Nobody needs it while tracking is off for everyone |
| **Plain-text body rework** | Beyond what removing links already requires |
| **Open/click tracking** | Off by default for all clients. Optional opt-in later. The cost is smaller than it sounds — Apple Mail Privacy Protection has made open rates unreliable industry-wide for years |
| **`go.<domain>` CNAME** | Becomes a later **upsell**, not an onboarding barrier |

### Not in August — September and beyond

Automated domain checking (Phase 1a) · the per-DNS-host instruction pack · DNC
related-domain detection (Phase 2) · bounce/complaint auto-halt (Phase 4) · list
verification (Phase 4) · all AI work (Phases 5–6).

### Programme size — say this out loud

| Scope | Naive | Tier P ×3.0 |
|-------|-------|-------------|
| Relationship-saving work (Phases 0–4) | 28.5d | **~85d** |
| Full programme including AI | 46.5d | **~139d** |

**At half-time capacity the full programme is roughly 8 months, not 3.** Do not
let the client infer a full-time pace from a part-time engagement.

---

## 5. Constraints stated by others

Recorded verbatim where possible, with attribution.

| Constraint | Who | Status |
|-----------|-----|--------|
| "Current setup requires each client to add DNS records pointing back to OpenDoors' sending domain; the OpenDoors owner does not want to require this" | OpensDoors owner, via Greg's project notes | **Resolved, and the premise was wrong in both directions.** Graph sending needs zero DNS changes. See `DOMAIN-BRIEF-cold-email.md` and §1 of the roadmap |
| "A working system by end of August" | OpensDoors | In scope, pinned in §1 above |
| Emails are reaching companies on the do-not-contact list | OpensDoors, raised directly | **Live compliance exposure.** Phase 2. Deliberately sequenced ahead of the domain-verification work because a DNC breach is the kind of thing that terminates a strained relationship |
| Google OAuth app to stay in Testing mode | Greg | Accepted. Costs weekly Google-mailbox reconnects |

**A client requirement is not evidence that the requirement is possible.** The
zero-DNS constraint is the worked example: it was set as a business preference,
was incompatible with how email works *as originally architected*, and turned out
to be achievable only because the transport is the customer's own mailbox.

---

## 6. Who is not in the room

- **The corporate customers' IT administrators.** They must grant Entra **admin
  consent** for a mailbox to be connected. This is identity approval, not DNS,
  but it is still a person outside this engagement who must click approve. It is
  almost certainly what OpensDoors half-remembered as "getting IT to update their
  firewalls"
- **OpensDoors' own staff** (Lucy and colleagues) operate the product daily. UI
  and copy changes land on them without warning
- **A solicitor.** The UK PECR/GDPR position in the domain brief is explicitly
  *not legal advice* and says to confirm before relying on it commercially.
  **NEEDS CONFIRMATION — this has not been done**

---

## 7. Definition of done for this engagement

Per `ENGINEERING-STANDARD.md`, and none of it may be claimed without running it:

- lint, typecheck, tests, build all green
- new business logic carries real tests
- no secrets in the repo
- CI green, merged to protected `main` via PR
- deploy verified **by commit** via `/api/build-info`, never by liveness alone
- `CUSTOMER-READY-REPORT.md` completed by walking the product live before any
  claim that it is sellable
