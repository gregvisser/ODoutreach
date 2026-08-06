# OpensDoors Outreach — Roadmap, August 2026

**Written 2026-08-06 · BidlowAI (Greg Visser) · Tier P (Client Production)**

This document covers the changes OpensDoors requested in August 2026, the technical
findings that reshaped them, and the order we will build them in.

It is written in plain English on purpose. It should make sense to a non-technical
reader, because parts of it are meant to be repeated to the client.

---

## 1. The headline finding — corporate customers do not need to change their DNS

OpensDoors' main blocker is that their larger customers will not set up DNS records,
because of the phishing/quarantine incident. **That blocker is based on a
misunderstanding, and removing it is the single most valuable thing in this roadmap.**

### What actually happens when we send

ODoutreach sends through the customer's own mailbox using Microsoft Graph
(`POST /users/{mailbox}/sendMail`, see `src/server/mailbox/microsoft-graph-sendmail.ts`)
or the Gmail API. That means:

- The email leaves through the customer's **own Microsoft 365 or Google tenant**
- It comes **from their own address**
- It lands in **their own Sent Items**
- It is indistinguishable from an email their staff typed by hand in Outlook

**Sending through ODoutreach *is* sending from Outlook.** They are the same pipe.
There is no second domain involved and therefore no domain mismatch.

### Why no DNS changes are needed

| Record | What the customer must do | Why |
|--------|---------------------------|-----|
| **SPF** | **Nothing** | The message goes out on Microsoft's (or Google's) IPs. The customer's existing SPF record already authorises those — it must, or they could not send email at all today. SPF passes and aligns with the From: address. |
| **DKIM** | **Nothing** | Exchange Online DKIM-signs all outbound mail automatically. Without custom-domain DKIM it signs as `<tenant>.onmicrosoft.com`, so DKIM *alignment* fails — but that is not fatal (see below). |
| **DMARC** | **Nothing** | DMARC passes if **either** SPF **or** DKIM aligns. SPF aligns. DMARC passes — with or without a DMARC record published. |

Enabling custom-domain DKIM and publishing a DMARC record make things **better**,
not **possible**. That is a completely different conversation to have with a
corporate: an optional improvement, not a mandatory project.

### The one thing they cannot avoid

**OAuth admin consent.** You cannot send from someone's mailbox without permission
to use it. This is an identity approval, not a DNS change — a single admin clicking
approve on a business app, the same as any other third-party integration.

This is almost certainly what OpensDoors half-remembered as "getting IT to update
their firewalls".

### The risk profile is inverted

Large corporates (BT, Adidas scale) **already have SPF, DKIM and DMARC**, usually at
`p=reject`. For them the DNS work is genuinely zero. It is the **small SME customers**
with neglected DNS who are the harder case.

OpensDoors currently believes the opposite.

---

## 2. What probably caused the incident

**Not yet proven. Phase 0 establishes this before we tell the client anything.**

If DMARC passes automatically when sending through a customer's mailbox, then the
phishing/quarantine damage did not come from mailbox sending. Three candidates, none
of which is fixed by DNS changes:

| | Failure | What it does | Fix status |
|---|---------|--------------|------------|
| **A** | Mail sent through the legacy Resend/ESP path carrying `From: someone@customerdomain.com` | Resend's IPs are **not** in the customer's SPF → **hard SPF fail on every message**, looks exactly like spoofing → real reputational damage | Leading suspicion. If confirmed, that code path gets **removed**, not gated |
| **B** | Cold mailbox sending too fast | Microsoft's *outbound* spam filter throttles the tenant (`550 5.1.8`). **Nothing to do with DNS.** | Warm-up ramp already written and tested — **switched off** |
| **C** | Unsubscribe/tracking links pointing at the ODoutreach app domain | Phishing heuristic → **per-message quarantine** (not domain damage) | Already written — **switched off**. Also disappears entirely under the zero-DNS profile (see §3) |

**Correction worth recording:** a signature naming a different company is at most a
very weak spam signal. It causes neither quarantine nor domain damage on its own, and
is not the cause here.

**Also worth recording:** "domain mismatch" means two different things. In the
protocol sense it means DMARC alignment (From: header vs DKIM `d=` or SPF
Return-Path). In the everyday sense people use it for links not matching the sender.
Only the first is an authentication failure.

### Deliverability flags currently OFF

All five require an explicit opt-in value, so all default to inactive:

```
OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN    off   ← issue C, hard block
OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN    off   ← issue C, tracking pixel
MAILBOX_WARMUP_RAMP                     off   ← issue B, the volume ramp
SEND_DISPATCH_RECHECK_ENABLED           off   ← cooldown + bounce backstop
MICROSOFT_MIME_SEND                     off
```

`BOUNCE_SUPPRESSION_ENABLED` is confirmed **on** in production.

The fixes for two of the three failure modes are built, tested and inert.

---

## 3. Decisions taken

| Decision | Choice |
|----------|--------|
| Corporate transport | Graph auto-send. Draft-into-Outlook **deferred** — built on request only (see below) |
| Mailbox access model | Dedicated mailbox at the corporate (e.g. `outreach@theircompany.com`), OAuth consented once |
| DNS requirement | **Zero.** Tracking off by default; `go.<domain>` CNAME becomes a later upsell |
| Open/click tracking | Off by default for all clients. Optional opt-in later |
| Root cause | Investigate and evidence before asserting |
| DNC matching | Auto-block on strong signals, suggest-only on weak |
| AI autonomy | Graduated ladder, unlocked on measured evidence |
| AI channels | **Email only.** No LinkedIn outreach automation |
| Scale target | Design for 10–50 corporates |

### Why tracking-off is the right default

Turning tracking off does not *solve* the link-misalignment problem — it **deletes**
it. No tracking pixel and no wrapped links means there are no foreign-domain URLs in
the email at all. Nothing left to look like phishing.

Plain-text, no-pixel, reply-to-opt-out cold email is what the strongest practitioners
in this industry send anyway, and it typically lands better than the tracked version.

The cost is open and click data. That cost is smaller than it sounds: Apple Mail
Privacy Protection pre-fetches tracking pixels, so open rates have been unreliable
industry-wide for several years.

Unsubscribe stays legally compliant under PECR via `mailto:` plus a plain-English
"reply STOP" line.

### Why draft mode is deferred, not cancelled

Draft mode (the system writing into the customer's Drafts folder for a person to send)
was originally requested because corporates would not accept the system sending on
their behalf. **Section 1 removes that premise** — corporates can send through the
system with zero DNS changes.

What remains is **optics only**. OpensDoors staff, not the corporate, would be doing
the reviewing, because OpensDoors sets up the corporate's mailbox. The same
organisation decides to send either way, so draft mode adds **no actual safety**. It
buys reassurance for a nervous customer and nothing more.

**Decision: do not build it speculatively.** It is roughly half of Phase 3 — about a
week at Tier P — spent against an objection that may no longer exist. Keep it as a
conversational lever ("we can enable that for you") and build it only if a specific
corporate asks. Lead time if requested is about a week.

Note this is a change from the first draft of this roadmap, which committed to
building it in Week 8.

---

## 3a. August 2026 delivery constraint

**The client wants "a working system by end of August." Capacity is ~9 working days
(half-time, 6–31 August).** Phases 0 + 1c as originally scoped need 13 Tier P days, so
Phase 1c is trimmed to fit.

### What "working by 31 August" is committed to mean

Agree this in writing with the client before starting. The system already works — the
phrase must be pinned to something specific or it will be judged against whatever they
imagined:

- Corporate customers can be connected and sent from, **with no DNS changes**
- Sending goes from their own mailbox, tracking off, nothing that can read as phishing
- Volume protection active on every new mailbox from day one
- Deliverability review findings delivered

**Not** in August: automated domain checking, the instruction pack, DNC related-domain
detection, auto-halt, list verification, AI.

### Phase 1c trimmed for August

| In | Out (moves to September) |
|----|--------------------------|
| Tracking off — no pixel, no wrapped links | The `ALIGNED_DOMAIN` opt-in mode (nobody needs it while tracking is off for everyone) |
| `mailto:` unsubscribe + "reply STOP", satisfying the send-governance gate | Plain-text body rework beyond what removing links requires |
| Tests on both | |

Trimmed cost: ~5 Tier P days. **Phase 0 (4d) + Phase 1c-minimal (5d) = 9d into 9 days
available — zero slack.**

### Sequencing so partial delivery is still coherent

Work in this order. Every stopping point is shippable, so a slip is a soft landing
rather than a missed deadline:

| Days | Work | Standalone value if everything after it slips |
|------|------|----------------------------------------------|
| 1–4 | Forensic pass · flag audit · `MAILBOX_WARMUP_RAMP` ON · findings doc | Evidence delivered, the likely root cause fixed |
| 5–6 | Tracking off by default | The phishing signal is gone |
| 7–9 | `mailto:` unsubscribe + governance gate | Corporate onboarding unblocked |

**Known risk to this plan:** if the forensic pass finds mail went out via the Resend
path, removing that code is unplanned work that does not fit in 9 days. Flag it to the
client immediately if so rather than absorbing it.

---

## 4. The roadmap

Estimates are **person-days of effort**, given naive and at the Tier P ×3.0
multiplier. They are not calendar days — map them to actual availability.

| Phase | Week | What lands | What the client sees | Naive | Tier P |
|-------|------|-----------|---------------------|-------|--------|
| **0** | 1 | Forensic root cause · warm-up ramp ON · flag audit · findings doc | "We found what broke, and it's already fixed" | 1.5d | 4d |
| **1c** | 2 | **Zero-DNS send profile** — tracking off, `mailto:` unsubscribe, plain-text path | "Your corporates need to do nothing" | 3d | 9d |
| **2** | 3–4 | DNC brand grouping | "Add BT, it finds BTeurope by itself" | 6d | 18d |
| **1a** | 5–6 | Live DNS verification that **proves no change is needed** · per-host instruction pack for the minority who do need something | "Ten-second check instead of a three-week IT negotiation" | 6d | 18d |
| **1b** | 7 | Gate fails closed on genuinely dangerous cases only | Safety net — invisible when healthy | 2.5d | 7.5d |
| **3** | 8 | Per-client batch size · randomised pacing | "4 at a time, sporadic" | 1.5d | 4.5d |
| **4** | 9–11 | Bounce/complaint auto-halt · list verification · mock-provider and migration-gate fixes · repo cleanup | Reliability, two open defects closed | 8d | 24d |
| **5** | 12+ | AI ladder Level 1 + reply triage | "AI drafts it, staff approve, machine sends" | 10d | 30d |
| **6** | — | Deliverability Guardian agent · Levels 2 and 3 | The differentiator | 8d | 24d |

**Relationship-saving work (Phases 0–4): naive 28.5d → Tier P ~85d**
**Full programme including AI: naive 46.5d → Tier P ~139d**

Week 8 is now a light week. That freed capacity is **deliberate buffer** — it absorbs
slippage from Phases 1a and 2 without moving the Phase 4 dates. For a client watching
for slipped commitments, hitting declared dates matters more than filling every week.

**Phases 0 and 1c together are ~13 Tier P days.** That is the work that removes the
client's stated objection, and it fits inside the 2–4 week window with room to spare.

### Sequencing logic

**1c jumps ahead of the verification gate deliberately.** The gate is better
engineering, but the zero-DNS profile is what removes the client's reason for not
using the system. One week that makes the objection obsolete beats three weeks that
make it manageable.

**Phase 2 (DNC) moves ahead of the domain-verification work** (decision taken
2026-08-06). It is a live compliance exposure — emails are currently reaching
companies on the do-not-contact list, and the client raised it directly. A DNC breach
is the kind of thing that terminates a strained relationship. The verification tooling
is valuable, but nothing is *broken* because it is missing, and the August zero-DNS
work already unblocks corporate onboarding without it.

---

## 5. Phase detail

### Phase 0 — Truth and free wins (Week 1)

- Forensic root-cause pass: historical DNS state on the affected domains, whether
  custom-domain DKIM was ever enabled, `550 5.1.8` patterns in the `OutboundEmail`
  failure log, and whether any mail went out via the Resend path
- Audit which flags are actually set in Azure App Service config
- Enable safe flags **one at a time**, with a stable window and verification between
  each. Recommended order: findings doc → `MAILBOX_WARMUP_RAMP` → stable window →
  `SEND_DISPATCH_RECHECK_ENABLED`
- Written findings document for the client conversation

### Phase 1c — Zero-DNS send profile (Week 2)

- Per-client `trackingMode: OFF | ALIGNED_DOMAIN`, defaulting to `OFF`
- `mailto:` unsubscribe plus "reply STOP" line, replacing the hosted link when
  tracking is off
- Plain-text body path with no pixel and no wrapped links
- Every piece already exists — this is wiring and a toggle, not new capability

### Phase 1a — Domain verification and the instruction pack (Weeks 3–4)

The verification gate's purpose is **inverted** from the original Phase 1 spec. It no
longer forces customers to change DNS. It **proves they do not need to**. Staff paste
a domain and get: *"Verified — nothing to do. Safe to send."*

- Live DNS verification: SPF parse, DKIM selector lookup, DMARC parse, alignment check
- **Simplifier:** because `MailboxProvider` is already stored, we know which DKIM
  selectors to check — `selector1`/`selector2._domainkey` for Microsoft 365,
  `google._domainkey` for Workspace. The general-case hard problem does not apply
- MX comparison against the customer's primary domain
- Per-DNS-host instructions (GoDaddy, Cloudflare, 123-reg, Squarespace have different
  interfaces) for the minority who do need a change — non-technical, copy-paste
- Read-only. Ships with **zero risk to live sending**

This is OpensDoors' request #2, delivered as a product feature rather than a template.

### Phase 1b — Gate fails closed (Week 5)

Blocks only genuinely dangerous configurations, not merely imperfect ones:

- No SPF record at all
- `p=reject` DMARC with strict alignment (`aspf=s`) where we cannot satisfy it
- Sending domain MX matching the customer's primary business domain
- Scheduled re-verification — a domain that passed in March can fail in July

### Phase 2 — DNC brand grouping (Weeks 6–7)

Currently `suppression-guard.ts` matches domains on an **exact** unique-key lookup.
`bt.com` on the DNC list does nothing for `bteurope.com`.

- eTLD+1 normalisation via the Public Suffix List, so `bt.co.uk` resolves to
  `bt.co.uk` and not `co.uk` (prerequisite, missing today)
- `SuppressedOrganisation` entity — domains attach to a company, not floating strings
- **Auto-block on strong signals:**
  1. **Shared Entra tenant ID** — `https://login.microsoftonline.com/{domain}/.well-known/openid-configuration`
     returns the tenant ID for any domain, unauthenticated and free. Two domains in
     the same tenant are the same company. Not a heuristic — a fact. This alone
     catches most of the BT case
  2. **Shared DMARC `rua` address** — both reporting to the same security mailbox
  3. **Common HTTP redirect target** (`btcontracts.co.uk` → `bt.com`)
- **Suggest only:** brand token match, minimum 4 characters so `bt` never matches
  `btw.com`
- Note: Microsoft MX records encode the tenant slug
  (`bt-com.mail.protection.outlook.com`) and are a useful signal, but Google Workspace
  uses a shared `aspmx.l.google.com` for everyone, so MX is unreliable as a general
  test. The tenant-ID lookup supersedes it

### Phase 3 — Sporadic pacing (Week 8)

- Per-client batch size (their requested 4), randomised inter-batch interval,
  intra-batch jitter. Replaces the fixed `OUTBOUND_QUEUE_BATCH_SIZE=8` every 5 minutes

**Deferred — build only on request:** `sendMode: AUTO_SEND | DRAFT_FOR_REVIEW`.
Identical pipeline, one branch at dispatch — `POST /users/{mailbox}/sendMail` versus
`POST /users/{mailbox}/messages`. About a week at Tier P if a corporate asks for it.
Rationale in §3.

### Phase 4 — Auto-halt, list verification, housekeeping (Weeks 9–11)

- Bounce >2% / complaint >0.1% triggers automatic halt. The rates are already
  computed in `src/lib/reports/outreach-metrics.ts` — nothing acts on them today
- Pre-send list verification: MX, SMTP probe, catch-all detection, spam-trap screening
- `EMAIL_PROVIDER` mock default must fail loudly in production rather than silently
  reporting success
- Migration gate: code must not deploy against an un-migrated database
- Repo cleanup: historical audits into `docs/audits/`, remove `CLAUDE.md.bak`, add
  `.gitattributes` with `* text=auto eol=lf`

### Phases 5–6 — AI (Week 12 onwards)

Separate commercial conversation. Outline in §6.

---

## 6. AI proposal (outline only)

**Where the market is:** Clay owns AI research and enrichment. Instantly and Smartlead
do AI reply categorisation. Regie, 11x and Artisan sell "autonomous AI SDR" — heavily
funded, and actively worsening inbox saturation, which is becoming a liability rather
than a moat.

**Where OpensDoors can genuinely lead — build this one first:**

### The AI Deliverability Guardian

An agent that continuously watches per-domain bounce rate, complaint rate, DNS drift,
blacklist status and placement signals, and **pulls the handbrake autonomously** —
then explains in plain English what it did and why.

**Nobody in this market has it.** Every competitor optimises for volume. OpensDoors
would be the only one optimising for not damaging the customer's domain.

It is the exact product answer to the incident that nearly lost the client. It turns
their worst moment into their differentiator.

### Supporting features, in order

1. **Reply triage** — interested / not interested / out-of-office / wrong person /
   referral, with auto-routing. Biggest staff time-saver available
2. **AI research and personalisation** — per-prospect opener from public data
3. **Campaign composer** with compliance linting and spam-signal checks before a
   human approves

### The autonomy ladder

| Level | Behaviour | Unlock condition |
|-------|-----------|-----------------|
| **L1** | AI drafts, human approves **every** email | Starting state |
| **L2** | Human approves the campaign, machine dispatches | Measured clean bounce and complaint rates over a defined volume |
| **L3** | Exception-only review, machine halts itself on anomaly | Sustained clean metrics |

Each unlock is gated on **measured evidence**, not time served. This gives the client
the autonomy they asked for while making a repeat incident structurally impossible.

### Explicitly out of scope

**LinkedIn outreach automation.** Automated connection requests and InMail violate
LinkedIn's terms of service and get accounts permanently banned. The accounts at risk
belong to OpensDoors' customers — the same blast radius that caused the current
problem. Organic content publishing to company pages via official APIs is compliant
and could be scoped separately if wanted.

---

## 7. What to tell OpensDoors

Do **not** say "it wasn't DNS" until Phase 0 produces evidence. Say "we're confirming
the cause this week."

> "We've established what actually happened, and the good news is your corporate
> customers don't need to change anything. When we send through their own Microsoft
> 365 mailbox, the email leaves their tenant, from their address, authenticated by the
> SPF record they already have. DMARC passes automatically. There is no DNS project.
> We're also switching off open tracking by default, which removes the last thing that
> could make an email look like phishing. What we do need is one admin approval to
> connect the mailbox — the same approval they'd give any business app. That's it."

Then the honest part, which builds more trust than it costs:

> "We also found that a volume-ramp protection was built but never switched on. That's
> live now. If the original damage was caused by sending too fast from a cold mailbox
> — which is what the evidence points at — that's the fix, and it's already in place."

---

## 8. Assumptions and risks — flagged, not buried

- **The SPF/DMARC mechanics are settled protocol behaviour.** High confidence.
- **The cause of the specific incident is not established.** Phase 0 settles it. If
  mail went out through the Resend path with an unaligned `From:`, that code gets
  removed in Phase 0 rather than gated later.
- **A customer with no SPF record at all** is the one case where the zero-DNS position
  weakens. Rare on Microsoft 365, and exactly what Phase 1a detects.
- **Estimates assume solo work** at the Tier P standard. Calendar compresses with
  availability.
- **Scale is unknown.** Designed for the 10–50 corporate band. Nothing in that choice
  blocks scaling later.
- **Exactly-once delivery is still not guaranteed.** For cold outreach a duplicate send
  is a commercial embarrassment for the client's customer. This needs to become a
  written, accepted limitation — it is not currently one.

---

## 9. To unblock Phase 0

1. **Production database read access**, or Greg runs supplied queries — the forensic
   pass needs the real `OutboundEmail` failure log
2. **The affected domains** from the incident, to check current DNS state
3. **Confirmed flag order** — recommendation is findings doc first, then
   `MAILBOX_WARMUP_RAMP`, then a stable window, then `SEND_DISPATCH_RECHECK_ENABLED`

---

## Evidence baseline (2026-08-06)

Gates run at the time of writing, on commit `4bb16d6`:

```
lint       npm run lint     → clean, 0 problems
typecheck  tsc --noEmit     → 0 errors
tests      vitest run       → 1828 passed / 213 files / 0 failed
```

CI additionally runs `prisma validate`, coverage with enforced thresholds
(statements 56 · branches 78 · functions 76), webpack build, integration tests
against a real PostgreSQL 16, and Playwright e2e with authenticated journeys.

**Engineering grade: 8.5/10.** Held off a 9 by the `EMAIL_PROVIDER` mock default and
the un-enforced production migration gate — both addressed in Phase 4.

**Customer-Ready grade: not yet assessed.** Requires a live walk-through of the
product as a customer, not a code review. Should be completed before the next
invoice-bearing milestone.
