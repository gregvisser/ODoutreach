# Claude Code Brief — ODoutreach (OpensDoors)
**Paste this as your first message in Claude Code, opened at
`C:\Bidlowprojects\BidlowClients\Opensdoors\ODoutreach`.**

---

You are working on **ODoutreach**, a BidlowAI client production system for OpensDoors. I am Greg
Visser, BidlowAI. I am a capable builder but **not** a domain expert in email deliverability —
and this is the project where that gap caused a real incident. Assume I may not know what I don't
know, and ask rather than assume.

## 🔴 READ THIS BEFORE ANY GIT COMMAND

**This repo is on `main`, and `.github/workflows/deploy-production.yml` fires on push to `main`.
A push deploys the client's live outreach platform to Azure App Service.**

There are also **2 unpushed commits** on `main` right now (engineering standard + domain brief).

Therefore:
- **Never push to `main`.** Create a branch, push the branch, open a PR. Non-negotiable #6 of the
  engineering standard says main is protected and changes land via pull request.
- Ask me before your first commit which branch to work from.
- Cron workflows (`process-outbound-queue.yml`, `sync-replies.yml`) drain the send queue every
  5 minutes and sync replies every 15. **Anything you change in the send path affects a live
  system that is actively sending email on behalf of real clients.**

## Before you touch anything — read these, in this order

1. `ENGINEERING-STANDARD.md` — v2.1. §0.5 tiers, §0.6 domain correctness, §1 non-negotiables,
   §6 tier verification.
2. `DOMAIN-BRIEF-cold-email.md` — the industry's actual rules, researched and cited: SPF/DKIM/
   DMARC, bulk-sender thresholds, warm-up ramps, bounce and complaint limits, UK PECR and GDPR.
   **§0 explains the incident. §6 is the feature that prevents recurrence.**
3. `CLAUDE.md` and `README.md` — the README is unusually honest about its own limits; that
   "Real vs stubbed" table is a genuine asset, keep it current.
4. `docs/` — four operational runbooks and six dated audit reports already exist.

## The context that matters most

**During testing, the client's email domain and mailboxes were damaged because SPF, DKIM and
DMARC were never established.** The owner wanted to stop the project. That was not a coding
failure — 1,934 tests were passing throughout. It was a domain-correctness failure: nobody
established the industry's rules before building, including me and including the AI I was
using.

A design constraint made it worse: **the client did not want to require their customers to add
DNS records.** Those DNS records *are* SPF, DKIM and DMARC. There is no architecture that works
without them. That conflict was written in my own project notes as "the main open problem" and
neither of us understood how serious it was.

**So the most valuable thing this repo can gain is a gate that makes the failure impossible
again** — not documentation, not a checklist. Code that refuses to send.

## Rules of engagement — these override convenience

- **Tier: P (Client Production).** Target band 8.5–9.5. Nothing is done until lint, typecheck,
  tests and build are green with a real test proving the new behaviour.
- **Cost multiplier ×3.0.** Give me the naive estimate *and* the Tier P number.
- **Interview before spec, spec before code.** If a task is underspecified, ask until it isn't.
- **Gates fail closed.** For anything irreversible — and sending email is irreversible — code
  refuses when it cannot confirm the precondition. It never proceeds quietly.
- **No silent fallbacks.** See Phase 1; this repo has a live example.
- **Teach me.** Explain every protocol, tool and regulation in plain English as you introduce it.
- **Show evidence, never assert.** Paste real command output. If you can't verify, say so.
- **Work in phases. Stop and report between them.**

---

# PHASE 0 — Verify production reality (read-only, no code)

Three things are documented as risks but nobody has confirmed what production actually does.
**All three turn on environment variables in Azure App Service config.** Do not guess.

## P0-1 · Is production actually sending, or silently pretending?

`src/server/email/providers/index.ts:15`

```ts
const mode = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase().trim();
```

`src/server/email/providers/mock-provider.ts` returns `mock_<hash>` ids and **does not hit the
network.** The same default appears at `src/server/email/sender-identity.ts:57`.
`src/server/email/outbound/execute-one.ts:214` comments *"Legacy / non-mailbox row: Resend or
mock"*, which suggests real client sends go through Microsoft mailbox identities and the mock
only applies to legacy rows.

**Establish, with evidence:**
1. Is `EMAIL_PROVIDER` set in production App Service config? What value?
2. Can a legacy non-mailbox outbound row still exist and reach the mock path in production?
3. Query production: are there `OutboundEmail` rows with a `providerMessageId` starting `mock_`
   that were created after go-live? **Any such row is an email the system reported as sent and
   never sent.**

If (3) returns rows, stop and tell me immediately. That is a live incident and a client
conversation, not a coding task.

## P0-2 · Are any dev-bypass flags enabled in production?

`ALLOW_DEV_INBOUND_SIMULATE` · `ALLOW_DEV_OUTBOUND_QUEUE` · `ALLOW_DEV_PROVIDER_SIMULATE` ·
`ALLOW_DEV_WEBHOOK_REPLAY` · `AUTOPROCESS_OUTBOUND_QUEUE`, plus three `OUTBOUND_DEV_*_SECRET`
values. The README says of one: *"Allow replay route in production (avoid)."*

Report which are set in production and what each one bypasses.

## P0-3 · Is the database in sync with the deployed code?

Production migrations are gated behind repo variable `PRODUCTION_PRISMA_MIGRATE`. When it is
unset or false, **a schema change can deploy against an un-migrated database.** Check whether it
is set, and whether the deployed schema matches `prisma/migrations`.

*Note: BidlowAI's own fork of this codebase runs on Railway with
`npx prisma migrate deploy && npm run start` in the start command, so migrations apply
automatically there. Two different risk profiles from one codebase — worth understanding both.*

**Report all three before writing any code.**

---

# PHASE 1 — The Sending Domain Readiness Gate

**This is the headline work. It is a genuine product feature, it is billable, and it makes the
incident impossible to repeat.** Full specification in `DOMAIN-BRIEF-cold-email.md` §6.

Before a client can send **anything**, the product must verify — at runtime, by live DNS lookup —
that their sending domain is correctly configured. Not a checklist. Not onboarding guidance. A
gate that refuses.

## P1-1 · Domain registration and separation

- Client enters their sending domain.
- **The product refuses a domain whose MX records match the client's primary business domain.**
  Cold outreach must never go from the primary domain — that is exactly what burned the client.
  A dedicated subdomain (`outreach.clientdomain.com`) or a separate domain only.
- Explain the choice to the user in plain English at the point of entry. See the brief §2 for
  the subdomain-vs-separate-domain decision and the volume thresholds.

## P1-2 · Generate the exact records, then verify them live

- Generate the precise SPF, DKIM and DMARC records for that domain, ready to copy.
- **Verify by live DNS lookup.** All three must be present and passing, with correct alignment —
  the domain in SPF *or* DKIM must match the `From:` header domain. A passing SPF record on the
  wrong domain does not count.
- DMARC minimum `p=none` with an `rua` tag; recommend `p=reject`.
- Also check forward-confirmed reverse DNS and TLS.
- **A subdomain does not inherit the parent's SPF/DKIM/DMARC — it needs its own.** This is one
  of the most commonly missed steps and may be the specific mechanism of the incident.

## P1-3 · The gate itself

**No send path may execute for a client whose domain has not passed verification.** Fail closed.
Re-verify on a schedule — DNS changes, and a domain that passed in March can fail in July.

## P1-4 · Enforce the warm-up ramp in code

From the brief §2: week 1 at 5–10/day, week 2 at 20–30, week 3 at 50–75, week 4 at 100–150, with
a 30-day minimum before normal volume. The product should **hard-cap daily volume by domain age**
and refuse to exceed the ramp.

Your existing per-mailbox limits (5 mailboxes, 30/day — `prisma/schema.prisma:530`) are already
*more conservative* than the industry standard of 4–6 mailboxes at 40–50/day. **The volume logic
was never the problem.** Don't loosen it; add the ramp on top.

## P1-5 · Continuous health monitoring with automatic halt

Track bounce rate, spam-complaint rate and blacklist status per sending domain. **Automatically
halt sending on breach**, and alert.

Thresholds from the brief: bounce **under 2%** (Gmail reviews reputation at 2%, Microsoft 365
throttles at 1.5%); spam complaints **under 0.1%, never reaching 0.3%**.

## P1-6 · List verification before send

Five checks on every list: syntax, domain validity, SMTP validity, catch-all detection, spam-trap
detection. An unverified list is the fastest route through the 2% bounce threshold, and spam
traps are unrecoverable.

## P1-7 · Consider open source before building

The brief lists candidates — [happydeliver](https://github.com/happyDomain/happydeliver),
[smtp-probe](https://github.com/monto-fe/smtp-probe),
[Domain-Mail-Check](https://github.com/ins1gn1a/Domain-Mail-Check). **Check licence and
maintenance health before embedding anything in a client product** (standard §7). Tell me what
you'd reuse versus build, and why.

## P1-8 · Tests

Verification passes and fails correctly; send blocked when unverified; send blocked when the
domain matches the client's primary MX; ramp cap enforced by domain age; automatic halt on
threshold breach. E2E on the onboarding journey, since this becomes a critical path.

**Sizing:** this is real work. Give me the naive estimate and the ×3.0 number before starting.
It is billable with an unarguable justification, and it makes the product materially better than
what exists in the market. Do not treat it as remediation.

---

# PHASE 2 — Close the silent-failure class

## P2-1 · Make the provider default fail loudly

If `EMAIL_PROVIDER` is unset in a production environment, the system should **refuse to start or
refuse to send** — not quietly substitute a mock that reports success. This is the same class of
defect as a missing DNS record: the system reports success while doing nothing.

Keep mock available for local development and tests, gated on `NODE_ENV`.

## P2-2 · Fix the migration gate

Code must never deploy against an un-migrated database. Either enable the gated migrate step or
make deploy fail when the schema and migrations disagree. **Deploying against a stale schema is
the mechanism of a real outage on the next schema change.**

## P2-3 · Audit the dev-bypass flags

Based on Phase 0. Any flag that can bypass normal behaviour in production should be impossible to
enable there, or should log loudly and visibly when active.

## P2-4 · Node version alignment

Local Node 22, CI and Azure Node 20. Align them or document why not.

---

# PHASE 3 — The scope audit (needs my answers)

A scope audit evidence pass was completed on 30 July. The full document lives outside this repo
at `C:\Bidlowbusiness\Opensdoors\SCOPE-AUDIT-2026-07-30.md` — it is a commercial document, so it
does not belong in the codebase (non-negotiable #3). The questions are reproduced here because
you need them and shouldn't have to hunt.

**Ask me these. Don't answer them yourself.** Each gap then gets classified: 🔴 we owe it ·
🟡 change request (billable) · 🟢 out of scope · 🔵 gold-plating · ⚫ ask the client.

**Evidence-anchored:**
1. `EMAIL_PROVIDER` mock default — from Phase 0, is production really sending? Should the default
   fail loudly?
2. **RocketReach: the README says "Stub", the code says shipped.** There's a full
   `RocketReachImportPanel`, `apiKeyConfigured` env gating, a `ROCKETREACH_IMPORT_JSON_DEBUG`
   advanced mode, and a PR #138 test suite. The Sources page tells users *"Upload a CSV or use
   RocketReach below."* Which is true? Was it ever in scope?
3. Dev-bypass flags — are any live in production?
4. Migration gate — was "deploys are safe and automatic" part of what I sold? Owed, or billable?
5. Hard limits (5 mailboxes, 30/day) are code-level, not configurable. Has the client asked to
   raise them? **This is a billable feature, not a defect.**
6. Reporting snapshots are seeded — does the client believe reporting is fully live?
7. Exactly-once delivery is not guaranteed. Does the client know? For cold outreach a duplicate
   send is a commercial embarrassment for *their* client. It needs to be a written, accepted
   limitation.
8. The DNS/deliverability architecture — was it scope, expectation, or an idea? **The options
   paper itself is a billable deliverable.**

**Only I can answer:**
9. What did I promise verbally that never got written down?
10. What has been **invoiced as complete**? *(Answer carefully — anything invoiced complete but
    stubbed or flagged off caps Scope Fidelity at 4.)*
11. What have I said "we could do that later" about? Each becomes an out-of-scope line and
    possibly a change request.
12. What am I blocked on from the client, and since when?
13. Which gaps have I already silently absorbed?
14. Is anything here built beyond what they're paying for? Six dated audit reports and four
    runbooks is exceptional work — **was it bought?**

**Then produce `SCOPE.md`** using the BidlowAI template: outcome, critical journeys, in scope
this quarter, **explicitly out of scope** (the most important section), assumptions, blocked-on-
client, change log, capacity ledger. Tier P requires it and this engagement has never had one.

---

# PHASE 4 — Standard compliance and hygiene

## P4-1 · Tier and gates in `CLAUDE.md`

```markdown
Tier: P (Client Production)

## 🔴 PRE-LAUNCH GATES (domain-readiness — do not bypass)
See DOMAIN-BRIEF-cold-email.md.
1. SPF + DKIM + DMARC verified by live DNS lookup with correct alignment —
   blocks any send to a real recipient
2. Sending domain must not match the client's primary MX — blocks domain registration
3. Warm-up ramp enforced by domain age — blocks exceeding the daily cap
4. Bounce / complaint thresholds monitored, automatic halt on breach
5. List verification before any send
Never ship code that can send without these passing. Fail closed.
```

## P4-2 · PECR compliance in the contact model

UK law distinguishes **corporate subscribers** (limited companies, LLPs, public bodies — no prior
consent needed) from **individual subscribers** (sole traders, unincorporated partnerships,
personal addresses — consent or soft opt-in required). It turns on legal structure, not on
whether someone is "a business."

**The contact import pipeline currently has no way to distinguish them.** That's a genuine
product feature with a compliance justification, and a competitive differentiator. Scope it,
don't build it blind — ask me first.

*(Your `suppression-guard.ts` already handles the always-required opt-out correctly. Good.)*

## P4-3 · README accuracy

The "Real vs stubbed" table is genuinely valuable — most suppliers won't write one. Keep it
accurate; it's currently wrong about RocketReach (see Q2). **A README that under-sells delivered
work costs money too.**

## P4-4 · Housekeeping

- Confirm no secrets on disk. Five credential files were quarantined on 30 July after being
  verified as **never git-tracked** — `.gitignore` already covered every pattern. Verify nothing
  new has appeared and `.env.example` is current (non-negotiable #2).
- Add `.gitattributes` with `* text=auto eol=lf` — the repo produces CRLF churn on every commit.
- `CLAUDE.md.bak` — remove if present.

---

# How to report back

At the end of each phase:

```
PHASE <n> — <complete | blocked>

Gates:    lint <n>  ·  typecheck <n>  ·  tests <n> passed / <n> failed  ·  build <ok|fail>
          (paste the actual output — a claim without evidence doesn't count)

Done:     <what shipped, with file paths>
Not done: <what you couldn't do, and why>
Unknowns: <anything you assumed — flag it, don't bury it>
Cost:     naive <x> days → Tier P ×3 = <y> days
Next:     <the single next action>
```

**End with the number of open questions, never with "this looks comprehensive."**

---

# Context you should have

- BidlowAI is a one-person UK consultancy. OpensDoors is a live client on a monthly retainer,
  and **the relationship is currently strained because of the deliverability incident.**
- The platform runs at `app-opensdoors-outreach-prod` on Azure App Service via GitHub Actions
  OIDC. Auth is Microsoft Entra ID with a required `StaffUser` row.
- **This system sends email on behalf of the client's own customers, from those customers'
  mailboxes.** A mistake damages a third party's domain reputation, not just ours. That is the
  bar — higher than most software, because the blast radius extends two companies out.
- The engineering underneath is genuinely good: a Postgres queue using `FOR UPDATE SKIP LOCKED`,
  retries with `nextRetryAt`, idempotency keys, webhook dedupe, suppression enforcement,
  encrypted OAuth token storage, four runbooks and six dated audit reports. **Do not rebuild any
  of it.** The gap was never engineering quality — it was that nobody established the industry's
  rules before building.
- Passing tests do not mean domain-correct. That is why §0.6 of the standard exists, and why
  Phase 0 comes before Phase 1.
