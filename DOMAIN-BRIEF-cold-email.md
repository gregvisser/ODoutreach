# Domain Standards Brief — Cold Email Outreach
**Written 30 July 2026 · Researched, cited, current · For ODoutreach and any future outreach build**

> This is the document that should have existed before the first line of ODoutreach was
> written. It is the model for every future project in an industry Greg is not already an
> expert in.

---

## 0. First: the honest reframe

Before the technical content, one thing matters more than all of it.

From your own project notes: *"Current setup requires each client to add DNS records pointing
back to OpenDoors' sending domain; the OpenDoors owner does not want to require this, which is
the main open problem on the project."*

**Those DNS records are SPF, DKIM and DMARC. They are not a preference, a nice-to-have, or an
onboarding inconvenience. They are the mechanism by which the internet decides whether email
is real.** Since 2024 every major provider — Google, Yahoo, and Microsoft since 5 May 2025 —
has enforced them. Gmail escalated to permanent rejections in November 2025.

You built to a constraint the client set. The constraint was incompatible with how email
works. **That is not incompetence. That is a domain-knowledge gap on both sides of the table,
and the person best placed to catch it was whoever knew email deliverability — which was
nobody in the room, including me.**

This does not make it the client's fault either, and going into that conversation looking to
apportion blame would be a mistake. But you should walk in knowing that the "main open
problem" you'd already flagged in your own notes *is the same problem that caused the
incident*. You identified it. You just didn't know how serious it was — and neither did I,
which is the actual failure worth fixing.

---

## 1. The non-negotiables — what this industry demands before a single send

These are not best practices. They are the entry requirements.

### Authentication (all three, on every sending domain)

| Record | What it actually does | Requirement |
|---|---|---|
| **SPF** | Lists which mail servers are allowed to send as your domain. The receiver checks the sending IP against this list. | Must exist and pass |
| **DKIM** | Cryptographically signs each message so the receiver can prove it wasn't altered and really came from you. | Must exist and pass |
| **DMARC** | Tells receivers what to do when SPF/DKIM fail, and where to send reports. | Must exist. Minimum `p=none`, `p=reject` recommended. Must include an `rua` tag for aggregate reports |

**Alignment:** the domain in SPF *or* DKIM must match the domain in the `From:` header. A
passing SPF record on the wrong domain does not count.

Also required: **forward-confirmed reverse DNS (FCrDNS)** on sending IPs, and **TLS** on
transmission.

### Thresholds you must stay under

| Metric | Limit | Consequence of breaching |
|---|---|---|
| Spam complaint rate | **below 0.1%**, never reach **0.3%** | Reputation collapse, then rejection |
| Bounce rate | **below 2%** overall | Gmail triggers a reputation review at 2%; Microsoft 365 throttles at 1.5%; Yahoo tolerates ~2.5% |
| Bulk sender threshold | **5,000+/day** to a provider | You become subject to the full bulk-sender rules |

### One-click unsubscribe

The `List-Unsubscribe` header must be present and functional, and opt-outs must be **processed
within 2 days**.

### The rule that would have saved the domain

> **Never send cold email from the client's primary business domain.**

Use a **dedicated secondary domain** (or a subdomain, see §2). If cold outreach goes badly on
the primary domain, the damage is not limited to the campaign — the company's ordinary email
to colleagues, customers and suppliers starts failing delivery. **That is exactly what
happened here.**

The only exception: genuinely tiny, highly targeted volume — think 5–10 a day.

---

## 2. The architecture that actually works

### Domain strategy — pick one

| Approach | When | Trade-off |
|---|---|---|
| **Subdomain** (`outreach.clientdomain.com`) | Under ~500 sends/day, parent domain already has good reputation | Inherits partial trust, but **still needs its own SPF, DKIM and DMARC records** |
| **Separate domain** (`clientdomain-hq.com`) | 1,000+/day, or you want total isolation | Zero reputation sharing — but starts from nothing and needs a full 30-day warm-up |

**Note the important detail:** a subdomain does *not* inherit the parent's SPF/DKIM/DMARC. It
needs its own. This is one of the most commonly missed steps, and it may well be the specific
mechanism here.

### Volume architecture

- **4–6 mailboxes per sending domain**
- **40–50 emails per mailbox per day**, maximum
- So one domain safely carries roughly 200 sends/day. Higher volume means more domains, not
  more per mailbox.

**Your product already enforces 5 mailboxes and 30/day per mailbox.** That is *more
conservative than the industry standard* and it is correct. **The volume logic in ODoutreach
was never the problem.** Worth knowing before that client conversation.

### Warm-up ramp — 30 days minimum, from zero

| Week | Daily volume | Notes |
|---|---|---|
| 1 | 5–10 | Highly engaged recipients only |
| 2 | 20–30 | |
| 3 | 50–75 | Increase ~15% every 2–3 days |
| 4 | 100–150 | |

Only after this does normal volume begin, and only while monitoring.

### List verification before any send

Five checks, every list: **syntax · domain validity · SMTP validity · catch-all detection ·
spam-trap detection.** An unverified list is the fastest route to breaching the 2% bounce
threshold, and spam traps are unrecoverable.

---

## 3. The legal position — UK

*Not legal advice. Confirm with a solicitor before relying on it commercially.*

UK cold email is governed by **PECR Regulation 22** plus **UK GDPR**, and the distinction that
matters is **the recipient's legal structure, not whether they're "a business."**

| Recipient type | Consent needed? |
|---|---|
| Limited companies, LLPs, public bodies (**corporate subscribers**) | **No prior consent required** |
| Sole traders, unincorporated partnerships, personal addresses (**individual subscribers**) | **Yes** — consent or soft opt-in, same as consumers |

A one-person limited company falls under the carve-out. A sole trader does not. **Your
contact-import pipeline has no way to distinguish these, and it should** — that is a genuine,
billable product feature with a compliance justification.

**Always required, regardless of recipient:**

1. **Truthful identification** — real sender name, real company identity, genuine reply
   address, no deceptive subject lines.
2. **A functional opt-out** — honoured immediately and maintained across *all* future
   campaigns. (Your `suppression-guard.ts` does this. Good.)

**UK GDPR on top:** a work email address is personal data. The usual lawful basis for B2B
outreach is **legitimate interests**, which requires a documented assessment — genuine
business purpose, proportionality, and that your interest outweighs the recipient's rights.
Generic addresses (`info@`) carry lower risk than named individuals.

---

## 4. Recovery plan for the damaged domain

Recovery is well-understood. It is slow, but it works — and having a dated, credible plan is
what turns "he's incompetent" into "he knows exactly what he's doing."

### Step 1 — Diagnose (do this today, before any conversation)

- **Google Postmaster Tools** — check domain reputation (High / Medium / Low / Bad) and the
  spam-rate graph to find when the decline started
- **Blacklist check** — Spamhaus and Barracuda matter most
- **Verify SPF, DKIM, DMARC** on every domain and subdomain that has sent
- **Pull the campaign metrics** — when did bounce rate cross 2%?
- **Volume analysis** — was there a spike, or inadequate warm-up?

> *"Recovery that doesn't address the root cause will fail — you'll rebuild reputation for a
> few weeks, make the same mistake, and burn it again."*

### Step 2 — Stop sending (days 1–7)

Halt all cold campaigns immediately. During the pause: remove every hard-bounced and
unverified address, request delisting from any blacklists, fix all authentication, clean the
list properly.

### Step 3 — Re-warm from zero (days 8–45)

Treat it as a brand-new domain. Start at 5–10/day, increase by ~5/day each week, **no cold
outreach at all during this phase**, monitor Postmaster Tools daily. Re-warming takes 4–6
weeks because you are overwriting negative signals, not building from neutral.

### Step 4 — Cautious reintroduction (days 46–90)

Once warm-up inbox placement holds above 85%: 10–15 cold sends/day to the best contacts,
increasing by 5/day weekly only while metrics hold. Cut volume immediately if anything slips.

### How long, honestly

| Severity | Indicators | Recovery |
|---|---|---|
| Minor | Medium reputation, slight open-rate decline | 2–4 weeks |
| Moderate | Low reputation, landing in Promotions | 4–8 weeks |
| Severe | Bad reputation, blocked or spam-foldered | 8–16 weeks |
| Blacklisted | On multiple major lists | 6–12 months, or retire the domain |

### When to stop trying

Retire rather than recover if: it's on multiple major blacklists with delisting requests
rejected, or six to eight weeks of clean warm-up produces no improvement in Postmaster Tools.
**Standing up a fresh, correctly-configured domain takes 3–4 weeks.** If recovery will take
longer than that, starting clean is the professional recommendation, not an admission of
defeat.

**Critically: the client's *primary* domain — the one carrying their real business email —
must be separated from outreach permanently, whatever else happens.** That is the fix that
stops this recurring.

---

## 5. The conversation with the OpenDoors owner

You said he wanted to stop the project. Here is how I would approach it. Adapt to your voice —
but the structure matters more than the words.

**Do not lead with an apology.** Lead with a diagnosis, a plan, and a decision for him to make.
An apology invites him to decide whether you're competent. A diagnosis and a plan demonstrate
it.

> "I want to give you a straight account of what happened, why, and what I'm doing about it.
>
> **What happened.** Cold outreach was going out from domains that didn't have full SPF, DKIM
> and DMARC authentication in place. Since 2024, and Microsoft since May last year, every
> major provider rejects or quarantines mail that fails those checks. That's what caused the
> quarantining.
>
> **Why it happened.** The platform was built to avoid requiring your clients to add DNS
> records — that was a deliberate design constraint we discussed, because you didn't want
> onboarding friction. I built to that constraint. What I did not know at the time, and should
> have established before we started, is that those DNS records aren't a preference. They're
> the mechanism the entire email system uses to decide whether a message is real. There is no
> architecture that works without them. That's a gap in what I knew going in, and I own it.
>
> **What I'm doing.** I've now got a full standards brief for this industry — the
> authentication requirements, the volume and warm-up rules, the bounce and complaint
> thresholds, and the UK PECR and GDPR position. It's written down and it now gates the build.
>
> **Where the platform actually stands.** The engine is sound. Your sending limits — five
> mailboxes, thirty a day — are more conservative than the industry standard, so the volume
> logic was right. Suppression, do-not-contact and reply handling all work. **What was missing
> was a pre-flight gate that refuses to send from a domain until authentication is verified.**
> That's the fix, and it's not a large one.
>
> **Recovery.** [State what you found in Postmaster Tools and the realistic timeline from §4.]
> The one thing that must change permanently is that outreach stops going from your primary
> business domain. That separation is what stops this happening again.
>
> **The decision that's yours.** Onboarding a client now means adding DNS records to a
> dedicated sending domain. There's no way around it — it's how email works. That's either a
> guided onboarding step in the product, or a done-for-you service you charge for. I'd
> recommend building it into the product as a verification wizard that won't let a client go
> live until their records check out. **That turns the thing that hurt us into a feature
> nobody else in your space does properly.**"

**Three rules for that conversation:**

1. **Don't blame the constraint on him.** "We discussed" and "I built to it" are accurate and
   sufficient. Making him wrong wins the argument and loses the client.
2. **Bring the brief.** Hand over §1–§3 of this document. A supplier who returns with a
   researched, cited industry standard 48 hours after an incident does not look incompetent.
   That is precisely what competence looks like.
3. **Give him a decision, not a confession.** People stay with suppliers who bring them
   choices.

---

## 6. What ODoutreach needs built — the gate that was missing

This is a real product feature, not remediation, and it should be scoped and billed as one.

**A Sending Domain Readiness Gate.** Before any client can send:

1. Client enters their sending domain (must be a dedicated domain or subdomain — the product
   should refuse a domain that matches the client's primary MX)
2. Product generates the exact SPF, DKIM and DMARC records to add
3. Product **verifies them live by DNS lookup** and will not proceed until all three pass with
   correct alignment
4. Product checks FCrDNS and TLS
5. Product enforces the warm-up ramp automatically — hard-caps daily volume by domain age, and
   will not let a new domain exceed the week-1 number
6. Continuous monitoring: bounce rate, complaint rate, blacklist status — with an automatic
   send-halt on breach

**Steps 3 and 6 are the ones that would have prevented this entirely.**

At Tier P this is meaningful work — but it is *sellable* work with an obvious justification,
and it makes the product materially better than it was. Run `bidlow-intake` on it and quote it
properly.

### Open source you can use rather than build

You were right that GitHub has a lot of this already:

- **[happydeliver](https://github.com/happyDomain/happydeliver)** — self-hosted email
  deliverability testing platform
- **[smtp-probe](https://github.com/monto-fe/smtp-probe)** — SPF/DKIM/DMARC checks, SMTP
  verification and RBL blacklist scanning
- **[Domain-Mail-Check](https://github.com/ins1gn1a/Domain-Mail-Check)** — simple SPF and
  DMARC checking across domains

Check the licences before embedding any of them in a client product — see the Tooling & Cost
framework in `ENGINEERING-STANDARD.md` §7.

---

## Sources

- [2026 bulk email sender requirements checklist — Red Sift](https://redsift.com/guides/bulk-email-sender-requirements)
- [Bulk Email Sender Rules For Google, Yahoo, Microsoft & Apple (2026) — PowerDMARC](https://powerdmarc.com/bulk-email-sender-requirements/)
- [Dedicated cold email domain — Hunter.io Cold Email Guide](https://hunter.io/cold-email-guide/dedicated-cold-email-domain)
- [Subdomain for Cold Email: Protect Your Main Domain in 2026 — GrowLeads](https://growleads.io/blog/subdomain-for-cold-email-protect-main-domain/)
- [How to recover a burned domain and rebuild your sending reputation — Mailflo](https://mailflo.co/blog/recover-burned-domain/)
- [Is Cold Email Legal in the UK? PECR & GDPR for B2B, Explained — EA Partners](https://ea.partners/post/is-cold-email-legal-in-the-uk)
- [Cold email under PECR regulation 22 — Salespeople](https://www.salespeople.co.uk/explained/cold-email-pecr-regulation-22)
- [happydeliver — GitHub](https://github.com/happyDomain/happydeliver)
- [smtp-probe — GitHub](https://github.com/monto-fe/smtp-probe)
