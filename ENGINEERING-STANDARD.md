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
