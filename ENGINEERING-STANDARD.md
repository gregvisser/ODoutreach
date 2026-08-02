# BidlowAI Engineering Standard
**Version 2.1 · The rules every BidlowAI project follows.**

This is the constitution. It applies to every app, tool, and system BidlowAI builds or
maintains — regardless of stack (Next.js, Python, Astro, PHP, static) or host (Azure,
Railway, Cloudflare, Fly). The *tools* that satisfy each rule change per stack; the *rules*
never do.

**What changed in v2.1:** a **Domain Correctness** gate (§0.6). v2.0 measured whether the
code was real, tested and monitored. It never asked whether the thing being built was correct
*for its industry*. A cold-email platform shipped with every gate green while the client's
sending domain was destroyed, because SPF/DKIM/DMARC were never established. Passing tests
say nothing about domain correctness. §0.6 closes that.

**What changed in v2.0:** the quality bar is now **tiered**. v1.0 demanded 8.5–9.5/10 on
every project with no exceptions, which meant disposable experiments were held to the same bar
as client production platforms — unpaid, and at the cost of client work. The bar has not
dropped. It is now *aimed*. See §0.5.

## 0. The Production-First Doctrine (read this first)
There is no "prototype phase" that gets cleaned up later. **There is no later.** Every
line of a Tier P or Tier T project is written as if it ships to a paying customer today,
because it will.
- If it isn't **tested**, it isn't done.
- If it isn't **validated** at the boundary, it isn't safe.
- If it isn't **monitored**, it isn't in production — it's just running blind.
- If it can't be **rolled back**, it shouldn't be deployed.
- "It works on my machine" is not a status. "CI is green and it's monitored" is.

## 0.5 Tiers — declare one before the first commit

**Every project is exactly one tier. Write it on line 1 of `CLAUDE.md`.** The tier decides the
bar, the cost, and whether it may be sold. Changing tier is a deliberate decision with work
attached, not a drift.

| | **P — Client Production** | **T — Internal Tool** | **L — Lab** |
|---|---|---|---|
| **What it is** | Anyone pays for it, or a client depends on it | Internal or delivery infrastructure | A disposable experiment |
| **Target band** | **8.5–9.5** | **7–8** | **not graded** |
| **Cost multiplier** | **× 3.0** on naive build | **× 1.6** | **× 1.0** |
| Git + `.gitignore` | required | required | required |
| README a stranger can run | required | required | 3 lines: what, why, how to run |
| Strict typing | required | required | optional |
| Unit/integration tests on logic | required, thresholded | required on logic | none |
| CI gate blocking merge | required | required | none |
| Input validation at boundaries | required | required | none |
| E2E on critical journeys | **required** | not required | none |
| Error monitoring (Sentry) | **required, live before first deploy** | not required | none |
| Structured logging | required | recommended | none |
| Pre-commit hooks | required | recommended | none |
| Dependency/security scanning | required | recommended | none |
| Automated deploy + health check | required | recommended | none |
| Customer-Ready audit before selling | **required, gate ≥8** | n/a | **may never be sold** |
| `SCOPE.md` | **required** | not required | none |

**Rules about tiers:**
1. **A Lab may never be sold and may never be built to a 9.** Gold-plating a Lab is the purest
   waste in the estate. If a Lab starts earning, promote it to P — and *do the promotion work*
   before selling, not after.
2. **A Tier T project is finished at Tier T.** It is not a failed Tier P. Do not feel bad that
   an internal tool has no e2e suite; the standard says it doesn't need one.
3. **Promotion is a project.** L→T or T→P means retrofitting the tier's gates, and retrofitting
   is expensive. Choose the tier honestly at the start.
4. **When in doubt between two tiers, pick the lower and say so out loud.** Over-engineering an
   experiment has cost this business more than under-engineering ever has.

**Right-sizing within a tier remains a senior skill, not a shortcut.** A static brochure site
at Tier T is done at build + link-check + Lighthouse. The discipline is uniform; the ceiling
scales to what the product is.

## 0.6 Domain Correctness — establish the industry's rules before building

**The gap that cost a client their email domain.** Engineering quality and domain correctness
are different things, and a green CI gate tells you nothing about the second.

**Before the first line of code in any domain BidlowAI is not already expert in, run the
`bidlow-domain-readiness` skill.** It produces a `DOMAIN-BRIEF-<domain>.md`, committed to the
repo, covering:

1. **The real-world actions this software takes** — sending email, taking payment, storing
   personal data, publishing, contacting people. Anything with consequences no rollback undoes.
2. **The industry's non-negotiables**, researched **current** and cited. Never from memory —
   these rules change, and a stale brief repeats the failure it exists to prevent.
3. **Greg's honest knowledge map** per pillar: Expert / Working / Aware / Blank. Blank or Aware
   on a pillar that gates a real-world action is where the next incident comes from.
4. **Conflicts between what the client asked for and what the industry requires.** The
   highest-value finding this process produces. **A client requirement is not evidence that the
   requirement is possible.** Escalate in writing before building.
5. **Pre-launch gates** — see below.
6. **Existing open source**, checked for licence and maintenance, before proposing a build.

### Pre-launch gates — the rule that matters

> **No code may perform an irreversible real-world action until a gate has verified, at
> runtime, that the domain's preconditions are met.**

A gate is not a checklist item and not a line in a document. It is code that **fails closed** —
it refuses to act when it cannot confirm the precondition. "Remember to set up SPF" is advice,
and advice is what failed. "The product will not send until a live DNS lookup confirms SPF,
DKIM and DMARC pass with correct alignment" is a gate.

**Corollary — no silent fallbacks on real-world actions.** A provider that quietly falls back
to a mock when unconfigured is the same class of defect as a missing DNS record: the system
reports success while doing nothing. Real-world action paths fail loudly or not at all.

Gates go in `CLAUDE.md` near the top, and in `SCOPE.md` as sized, billable deliverables. **They
are product features with an obvious client justification — never absorbed as remediation.**

### Teach as you build (Greg's standing request)

Every tool, protocol or concept introduced gets a plain-English explanation at the point of
introduction: what it does, why it exists, where it lives in this stack, and what breaks
without it. Understanding is what lets Greg catch the next domain gap himself — which is the
only durable fix.

### Applies to existing projects too

`bidlow-scope-audit` takes its domain-correctness dimension from the brief. A project with no
`DOMAIN-BRIEF` in a specialist field is a finding, not an oversight.

## 1. The Non-Negotiables (all tiers, all stacks — no exceptions at any tier)
1. **Version control from commit #1.** Conventional commits. No work outside git, ever.
2. **Secrets live in env only.** Never in code, never in git, never in a `.txt` file on disk,
   never in a `.PublishSettings` file. `.env.example` current. Rotation documented.
   **If a secret has ever touched git history, rotate it — removal is not enough.**
3. **The repo is clean.** No committed binaries or media, **no other-client assets**, no
   commercial documents (see §1.5), no `node_modules`/`.venv`, no commented-out code, no stray
   TODO or `console.log`.
4. **No unversioned production dependencies.** If production needs a file, that file is in the
   repo. "Copy it in on the host" is not a dependency management strategy.
5. **`.gitattributes` with `* text=auto eol=lf`.** Prevents false drift signals across Windows
   and Linux.

Tier P and T additionally require:

6. **`main` is protected.** Changes land via pull request, never a direct push.
7. **A CI gate that blocks merge** on at least: lint + typecheck + tests + build.
8. **Strict typing on.** TS `strict` / typed + mypy/pyright-clean Python.
9. **Tests exist and are real.** Coverage measured and thresholded.
10. **Input validated at every boundary.** zod (TS) / pydantic (Python).
11. **A README a stranger can run from** — and that describes the product as it is *today*.
12. **Deploy is automated + verified.** One pipeline plus a post-deploy health check.

Tier P additionally requires:

13. **E2E on the critical journeys** named in `SCOPE.md`.
14. **Errors are observed.** Monitoring (Sentry) + structured logging (pino) before first deploy.
15. **Database migrations apply automatically on deploy.** Code must never deploy against an
    un-migrated database. A migration gate that can be left off is an outage waiting for a
    schema change.

## 1.5 Repository boundary (added v2.0)
**Code repositories contain code.** Sales decks, pricing documents, contracts, client guides,
audits and scope artefacts live outside the codebase:

```
C:\Bidlowprojects\<group>\<repo>      ← code only
C:\Bidlowbusiness\<client>\           ← decks, pricing, contracts, audits, SCOPE.md copies
```

*Why this is a rule:* v1.0 already forbade other-client assets, and it was still violated —
a prospect's pricing deck was committed into a client's repository. The rule failed because
the wrong kind of file had nowhere better to live. Document work belongs in Cowork, writing to
`Bidlowbusiness`. Code work belongs in Claude Code, writing to `Bidlowprojects`.

## 2. How You Build (stops "I prompt and it breaks")
0. **Domain brief before interview** for any specialist field (§0.6). You cannot scope what
   you do not understand the rules of.
1. **Interview before spec.** Greg will not think of everything at once, and is not expected
   to. The agent asks the intake questions (Operating Manual §5) until the spec is complete.
   Starting to code from an incomplete brief is the **agent's** failure, not Greg's.
2. **Spec before code** — goal / what must NOT change / how we verify. No spec, no code.
3. **Reuse before build.** Check the Asset Inventory's Reuse Index first. Reuse beats build;
   build beats research.
4. **Small diffs, one concern at a time.** Review the diff before accepting it.
5. **Full context in, or expect garbage out.**
6. **Green before commit** — lint + typecheck + tests after every change.
7. **Roll back, don't fight forward** — revert to the last green commit and retry.
8. **New scope surfaces as a change request the day it's found**, before the work is done —
   never after the deadline slips. See the Delivery Agreement §3.
9. **One toolchain.** Claude Code for building, Cowork for documents and cross-project work,
   Chat for thinking. No new AI coding tool without a ninety-day cooling-off period.

## 3. Definition of Done — by tier
**Every tier:** git from commit 1; `.gitignore` covers `.env`, build output, `node_modules`,
`.venv`; `.gitattributes` set; `.env.example` current; no secrets on disk; no other-client
assets; no commercial documents; a README.

**Tier T adds:** strict typing; real tests on business logic with a coverage threshold; input
validation; CI gate on lint + typecheck + tests + build; protected `main` via PR; a runnable
README describing the product as it is today.

**Tier P adds:** e2e on the critical journeys named in `SCOPE.md`; monitoring and structured
logging live before first deploy; pre-commit hooks; dependency and security scanning in CI;
automated deploy with a health check; automatic migrations on deploy; a current `SCOPE.md`;
a Customer-Ready audit scoring ≥8 before it goes in front of a paying customer.

## 4. Per-Stack Adaptation (same rule, different tool)
| | Next.js / TS | Python | Astro / static | PHP (legacy) |
|---|---|---|---|---|
| Typing | TS strict | pydantic + pyright | TS strict | phpstan |
| Tests | Vitest + Playwright | pytest + Playwright | build + link-check | phpunit + characterisation tests |
| Validation | zod | pydantic | n/a | manual, documented |
| Monitoring | Sentry + pino | Sentry + structlog | CDN analytics | Sentry + error log |

**Legacy takeover has one extra rule:** *no behavioural change before a characterisation test
net exists over the critical journeys.* You cannot safely upgrade what you cannot verify.
Writing those tests is the first billable deliverable of any legacy engagement, and it is
easy to justify to a client in exactly those words.

## 5. Cost & Hosting Policy
- Default new projects to low-cost, all-in hosting (**Railway** for full-stack, **Cloudflare**
  for static/edge). **Reserve Azure/AWS for a client requirement, credits, or real scale.**
  An internal tool on Azure with no client mandate is a standing overpayment — check it.
- Never migrate a working production app to save a small amount. Migrate only on a real trigger
  (cost spike, scaling wall, client requirement), through the same tested, monitored,
  rollback-able process.
- Put a billing alert on every production project.
- **Verify the licence position of every dependency you bill a client for.** Free-for-small-teams
  is not free-for-you once you grow. (Live example: Remotion requires a paid Company Licence
  above three people.)

## 6. Tier Verification Protocol (never claim a rating you haven't proven)

A tier is a claim about **evidence**, not a feeling. Before calling any repo
"production-ready" or assigning a grade, PROVE each criterion by running it and showing the
output. Assume nothing; round nothing up.

- A criterion counts **only if you ran it and saw it pass.** "Looks done" ≠ done. "Should
  pass" ≠ passes.
- If a gate can't be run or verified, it is **NOT met** — say so explicitly.
- Report the honest grade **with evidence**, e.g.: "lint ✅ 0 · typecheck ✅ 0 · tests ❌ 1
  smoke test, ~0% real coverage · monitoring ❌ no Sentry → this is a **5**, not a 9."
- **Missing tests is the #1 false-9.** A passing CI gate with no real test coverage is a
  *scaffold*, not a 9. Count what is actually **tested**, not what is wired.
- **Documentation counts.** A repo whose README describes a product it no longer is fails
  non-negotiable #11 regardless of code quality.
- A Tier P repo is a **9 only when ALL of these are present AND passing, verified by running
  them:** strict typecheck (0), lint (0), real tests on business logic with enforced coverage
  thresholds, e2e on critical journeys, error monitoring live, secrets gitignored and absent
  from disk, a CI gate that blocks merge, automated deploy + health check, migrations applied
  on deploy, an accurate README.
- **New projects: scaffold the tier's foundations FIRST, before features** — production-grade
  by construction, never retrofitted. Start from `bidlow-starter`; never hand-roll.

The failure mode to prevent: believing a repo is a 9 and discovering under load it was a 4.
The antidote: run the gates, show the evidence, report the honest number.

## 7. The BidlowAI Engineering Operating Model

Every **Tier P** project is built as a production system by a full engineering organisation,
from commit 1. Not a solo coder throwing up a shell: a team with roles, review, and a chain of
accountability. When an AI agent works a Tier P repo, it plays all of these roles in sequence
and does not declare work done until each is satisfied.

**Tier T runs a reduced chain:** Architect → Implementation → Test → Reviewer.
**Tier L runs no chain.** That is the point of a Lab.

### The org & the chain of accountability
- **Head of Engineering** — owns the architecture and this standard. Approves the plan before
  any code, and signs off on "done" only with evidence (§6). Has veto. Guards two lines above
  all: production from commit 1, and core structures before features — never ship a shell.
- **Architect / Staff Engineer** — before implementation, designs the core: data model, module
  boundaries, interfaces/contracts, error-handling and auth strategy, and the non-functionals
  (performance, cost, scale). Owns build-vs-buy, reuse-vs-build, and tool selection.
- **Implementation Engineers** — build strictly to the design, in small reviewable diffs.
  Strict types, validated boundaries, explicit error handling, no dead code or TODOs left.
- **Test / QA Engineer** — writes real tests on the business logic and e2e on the critical
  journeys; owns coverage and its thresholds. "It compiles" is not "it works."
- **Security Engineer** — secrets management, authentication/authorisation, input validation,
  prompt-injection defence, RBAC, output filtering, data privacy and compliance. **Also owns
  the multi-tenancy isolation tests** — one bad query is a cross-customer data leak.
- **SRE / DevOps** — the CI gate, automated deploy, post-deploy health check, migration
  application, structured logging, error monitoring, observability.
- **Code Reviewer** — an adversarial pass before merge: runs every gate, hunts for the gap,
  blocks on anything unproven. Reviewer and author are different hats — be your own sceptic.
- **Delivery Owner** *(added v2.0)* — keeps `SCOPE.md` current, raises change requests the day
  new scope is discovered, tracks capacity consumed, and reports blocked-on-client items
  weekly. **Work that is delivered but not accounted for is work given away.**

No task is complete until it has passed the relevant roles and the Head of Engineering has
proof. Solo or not, run the chain.

### Core structures before features (never shells)
A new repo's first work is the foundation, not a feature: git + `.gitignore` +
`.gitattributes`; the declared tier in `CLAUDE.md`; strict types; the data model / schema and
module boundaries; error, auth and config strategy; the test harness with a first real test;
the CI gate; error monitoring wired to env (Tier P); `.env.example`; `SCOPE.md` (Tier P); a
runnable README; and these standard files. Only once the skeleton meets its tier do features
get built on top. Retrofitting foundations later is exactly how a "9" turns out to be a 4.

### Tooling & Cost decision framework
Quality and cost are both first-class. For any library, tool, plugin or service, decide in this
order and record the trade-off:
0. **Do we already own it?** Check the Asset Inventory Reuse Index. BidlowAI owns a tested
   Postgres job queue, a multi-driver storage layer, a multi-tenant isolation pattern, an AI
   cost-routing pattern and a video pipeline. **Reuse first.**
1. **Can the standard library or an existing dependency do the job?** Prefer adding nothing.
2. **Is there a mature open-source option?** Prefer well-maintained OSS you can self-host or
   run free. Weigh maintenance health, security and community — not just features.
3. **Is a paid option justified?** Only when its quality, reliability or time-saved clearly
   beats the OSS route AND the cost is proportionate at real scale. Check the free tier first;
   put a billing alert on anything paid; **check the licence tier against company size**;
   never adopt a paid service by default.

Always choose the cheapest option that meets the tier's quality bar — and state why.

**Open-source-first defaults** (start here; move to paid only when the rule above is met):

| Need | Default (OSS / free-first) | Consider paid when |
|---|---|---|
| Hosting (web / full-stack) | Railway, Cloudflare, Fly | client mandates Azure/AWS, or real scale |
| CI | GitHub Actions (free tier) | — |
| Error monitoring | Sentry (free Developer tier); GlitchTip if self-hosting | volume/users exceed free |
| Logging / tracing | pino + OpenTelemetry; Grafana Loki (self-host) | managed APM clearly saves ops time |
| Metrics / dashboards | Prometheus + Grafana (self-host) | — |
| E2E testing | Playwright (free, OSS) | — |
| Auth | Auth.js / next-auth (OSS) | Clerk/Auth0 if compliance or time clearly justifies |
| Automation / orchestration | n8n (self-host) | Make/Zapier for quick, non-critical glue only |
| Vector store / RAG | pgvector, Chroma, FAISS (self-host) | Pinecone/managed only at real scale |
| Agent framework | the lightest thing that works — often none | LangChain/LlamaIndex only when they earn their weight |
| TTS / narration | Kokoro (local, CPU, free) | ElevenLabs for premium brand voice only |
| Image generation | FLUX via Hugging Face | HF PRO or paid endpoint at render volume |
| Programmatic video | Remotion — **check the ≤3-person licence limit** | Company Licence once above the limit |

### AI / agent projects — extra production gates (Tier P and T)
When a project uses LLMs or agents, these become production gates, open-source-first:
- **Prompting & control** — spec-first prompts; self-critique/reflection only where it earns its
  cost; keep deterministic paths where possible.
- **LLM & API hygiene** — rate limiting, retries with backoff, token/cost budgets, and model
  routing (cheapest model that meets the quality bar). *Reference implementation:
  ChangeFinder's `backend/ai-routing.test.mjs` — routes by user tier and is tested.*
- **Tool use** — validate every tool's inputs and outputs; sandbox code execution.
- **Memory & RAG** — ground retrieval in real sources and EVALUATE it; prefer self-hosted
  vector stores (pgvector / Chroma / FAISS).
- **Orchestration** — guardrails and validations at each step; make steps idempotent.
- **Evaluation is the "tests" of AI** — an AI feature is not done without evals measuring
  quality; add human-in-the-loop where stakes are high. Trace with OpenTelemetry.
- **Security & governance** — prompt-injection protection, API-key management, RBAC, output
  filtering, red-team testing, data privacy and compliance.

An AI feature with no evals is the AI equivalent of a repo with no tests — a scaffold, not a 9.

## 8. Companion documents
- **`BIDLOW-ASSET-INVENTORY.md`** — what BidlowAI owns, per tier, with the Reuse Index. Check
  before building anything.
- **`BIDLOW-OPERATING-MANUAL.md`** — which surface to use when, the tool decoder, the intake
  questions, where AI is the wrong tool.
- **`BIDLOW-DELIVERY-AGREEMENT.md`** — capacity accounting, `SCOPE.md` template, change-request
  wording, weekly client update.
- **`SCOPE.md`** (per Tier P repo) — what was agreed, what is explicitly out, what changed.
- **`DOMAIN-BRIEF-<domain>.md`** (per specialist field) — the industry's non-negotiables,
  thresholds, legal position, conflicts and pre-launch gates.
- **Skills:** `bidlow-intake` (before building), `bidlow-domain-readiness` (before intake in a
  new field), `bidlow-scope-audit` (existing projects).

---

*Standard owned by BidlowAI. Revisit quarterly. When a rule changes, bump the version and
propagate this file, `CLAUDE.md` and the PR template to every repo.*
