# BidlowAI Engineering Standard
**Version 1.0 · The rules every BidlowAI project follows, no exceptions.**

This is the constitution. It applies to every app, tool, and system BidlowAI builds or
maintains — regardless of stack (Next.js, Python, Shopify, PHP, static) or host (Azure,
Railway, Vercel, Cloudflare, Fly). The *tools* that satisfy each rule change per stack;
the *rules* never do.

Target quality band: **8.5–9.5 out of 10 on every project.** If a rule below is not met,
the work is not done — it is a prototype, and BidlowAI does not ship prototypes.

## 0. The Production-First Doctrine (read this first)
There is no "prototype phase" that gets cleaned up later. **There is no later.** Every
line is written as if it ships to a paying customer today, because it will.
- If it isn't **tested**, it isn't done.
- If it isn't **validated** at the boundary, it isn't safe.
- If it isn't **monitored**, it isn't in production — it's just running blind.
- If it can't be **rolled back**, it shouldn't be deployed.
- "It works on my machine" is not a status. "CI is green and it's monitored" is.

## 1. The Non-Negotiables (the gates — every repo, every stack)
1. **Version control from commit #1.** Conventional commits. No work outside git, ever.
2. **`main` is protected.** Changes land via pull request, never a direct push.
3. **A CI gate that blocks merge** on at least: lint + typecheck + tests + build.
4. **Strict typing on.** TS `strict` / typed + mypy/pyright-clean Python.
5. **Tests exist and are real.** Unit/integration on business logic; e2e on critical journeys; coverage measured + thresholded.
6. **Input validated at every boundary.** zod (TS) / pydantic (Python).
7. **Errors are observed.** Monitoring (Sentry) + structured logging (pino) before first deploy.
8. **Secrets live in env only.** Never in code/git. `.env.example` current. Rotation documented.
9. **The repo is clean.** No committed binaries/media, no other-client assets, no node_modules/.venv, no commented-out code, no stray TODO/console.log.
10. **Deploy is automated + verified.** One pipeline + a post-deploy health check.
11. **A README a stranger can run from.**

## 2. How You Build (stops "I prompt and it breaks")
1. **Spec before code** — goal / what must NOT change / how we verify. No spec, no code.
2. **Small diffs, one concern at a time.** Review the diff before accepting it.
3. **Full context in, or expect garbage out.**
4. **Green before commit** — lint + typecheck + tests after every change.
5. **Roll back, don't fight forward** — revert to the last green commit and retry.

## 3. Definition of Done
Foundation (every repo): git from commit 1; .gitignore covers .env/build/node_modules/.venv; .env.example current; strict typing; runnable README; no other-client assets.
Verification (every app): CI gate on lint+typecheck+tests+build; real tests + coverage threshold; input validation; protected main via PR.
Production tier (client-facing/revenue apps): e2e on critical journeys; monitoring + structured logging live before first deploy; pre-commit hooks; dependency/security scanning in CI; automated deploy + health check.

## 4. Per-Stack Adaptation (same rule, different tool)
Typing: TS strict / pydantic+pyright / TS strict / TS strict.
Tests: Vitest+Playwright / pytest+Playwright / Vitest+Shopify tooling / build+link-check.
Validation: zod / pydantic / zod / n/a.
Monitoring: Sentry+pino / Sentry+structlog / Sentry+pino / CDN analytics.
Right-sizing (a senior skill, not a shortcut): a static brochure site is "done" at build + link-check + Lighthouse — it does NOT need e2e or Sentry. The discipline is uniform; the ceiling scales to what the product is.

## 5. Cost & Hosting Policy
- Default new projects to low-cost, all-in hosting (Railway for full-stack, Cloudflare for static/edge). Reserve Azure/AWS for client requirement, credits, or real scale.
- Never migrate a working production app to save a small amount. Migrate only on a real trigger (cost spike, scaling wall, client requirement), through the same tested/monitored/rollback-able process.
- Put a billing alert on every production project.

*Standard owned by BidlowAI. Revisit quarterly. When a rule changes, bump the version and propagate CLAUDE.md + PR template to every repo.*

## Tier Verification Protocol (never claim a rating you haven't proven)

A tier is a claim about **evidence**, not a feeling. Before calling any repo
"production-ready" or assigning a tier, PROVE each criterion by running it and showing the
output. Assume nothing; round nothing up.

- A criterion counts **only if you ran it and saw it pass.** "Looks done" ≠ done. "Should pass" ≠ passes.
- If a gate can't be run or verified, it is **NOT met** — say so explicitly.
- Report the honest tier **with evidence**, e.g.: "lint ✅ 0 · typecheck ✅ 0 · tests ❌ 1
  smoke test, ~0% real coverage · monitoring ❌ no Sentry → this is a **5**, not a 9."
- **Missing tests is the #1 false-9.** A passing CI gate with no real test coverage is a
  *scaffold*, not a 9. Count what is actually **tested**, not what is wired.
- A repo is a **9 only when ALL of these are present AND passing, verified by running
  them:** strict typecheck (0), lint (0), real tests on business logic with enforced
  coverage thresholds, e2e on critical journeys, error monitoring live, secrets gitignored,
  a CI gate that blocks merge, automated deploy + health check.
- **New apps: scaffold these foundations FIRST, before features** — production-grade by
  construction, never retrofitted.

The failure mode to prevent: believing a repo is a 9 and discovering under load it was a 4.
The antidote: run the gates, show the evidence, report the honest number.

## The BidlowAI Engineering Operating Model

Every project — whatever it is, however small — is built as a production system by a full
engineering organization, from commit 1. Not a solo coder throwing up a shell: a team with
roles, review, and a chain of accountability. When an AI agent works a BidlowAI repo, it
plays all of these roles in sequence and does not declare work done until each is satisfied.

### The org & the chain of accountability
- **Head of Engineering** — owns the architecture and this standard. Approves the plan
  before any code, and signs off on "done" only with evidence (Tier Verification Protocol).
  Has veto. Guards two lines above all: production from commit 1, and core structures before
  features — never ship a shell.
- **Architect / Staff Engineer** — before implementation, designs the core: data model,
  module boundaries, interfaces/contracts, error-handling and auth strategy, and the
  non-functionals (performance, cost, scale). Owns build-vs-buy and tool selection.
- **Implementation Engineers** — build strictly to the design, in small reviewable diffs.
  Strict types, validated boundaries, explicit error handling, no dead code or TODOs left.
- **Test / QA Engineer** — writes real tests on the business logic and e2e on the critical
  journeys; owns coverage and its thresholds. "It compiles" is not "it works."
- **Security Engineer** — secrets management, authentication/authorization, input
  validation, prompt-injection defense, RBAC, output filtering, data privacy & compliance.
- **SRE / DevOps** — the CI gate, automated deploy, post-deploy health check, structured
  logging, error monitoring, and observability.
- **Code Reviewer** — an adversarial pass before merge: runs every gate, hunts for the gap,
  blocks on anything unproven. Reviewer and author are different hats — be your own skeptic.

No task is complete until it has passed the relevant roles and the Head of Engineering has
proof. Solo or not, run the chain.

### Core structures before features (never shells)
A new repo's first work is the foundation, not a feature: git + `.gitignore`; strict types;
the data model / schema and module boundaries; error, auth, and config strategy; the test
harness with a first real test; the CI gate; error monitoring wired to env; `.env.example`;
a runnable README; and these standard files. Only once the skeleton is production-grade do
features get built on top. Retrofitting foundations later is exactly how a "9" turns out to
be a 4.

### Tooling & Cost decision framework
Quality and cost are both first-class. For any library, tool, plugin, or service, decide in
this order and record the trade-off:
1. **Do we already have it?** Can the standard library or an existing dependency do the job?
   Prefer adding nothing.
2. **Is there a mature open-source option?** Prefer well-maintained OSS you can self-host or
   run free. Weigh maintenance health, security, and community — not just features.
3. **Is a paid option justified?** Only when its quality, reliability, or time-saved clearly
   beats the OSS route AND the cost is proportionate at our real scale. Check the free tier
   first; put a billing alert on anything paid; never adopt a paid service by default.
Always choose the cheapest option that meets the quality bar — and state why.

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

### AI / agent projects — extra production gates
When a project uses LLMs or agents (ref: the Agentic AI production domains — prompting,
agents, LLMs & APIs, tools, orchestration, memory, RAG, deployment, evaluation, security),
these become production gates, open-source-first:
- **Prompting & control** — spec-first prompts; self-critique/reflection only where it earns
  its cost; keep deterministic paths where possible.
- **LLM & API hygiene** — rate limiting, retries with backoff, token/cost budgets, and model
  routing (cheapest model that meets the quality bar).
- **Tool use** — validate every tool's inputs and outputs; sandbox code execution.
- **Memory & RAG** — ground retrieval in real sources and EVALUATE it; prefer self-host
  vector stores (pgvector / Chroma / FAISS).
- **Orchestration** — guardrails and validations at each step; make steps idempotent.
- **Evaluation is the "tests" of AI** — an AI feature is not done without evals measuring
  quality; add human-in-the-loop where stakes are high. Trace with OpenTelemetry.
- **Security & governance** — prompt-injection protection, API-key management, RBAC, output
  filtering, red-team testing, data-privacy / compliance.

An AI feature with no evals is the AI equivalent of a repo with no tests — a scaffold, not a 9.
