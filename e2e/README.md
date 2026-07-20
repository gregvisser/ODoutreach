# e2e (Playwright)

BidlowAI Engineering Standard §1.5 — end-to-end coverage of the critical journeys.

## What runs

| Spec | Covers |
|---|---|
| `sign-in.spec.ts` | Sign-in page renders; anonymous users are redirected |
| `journeys.spec.ts` | Admin operations, outbound-email detail, compose sheet, RBAC boundaries, unauthenticated redirect |

`safe-database.test.ts` is a **vitest** unit test (the seed's safety guard), not a
Playwright spec — Playwright only claims `*.spec.ts`.

## Authentication — seeded session cookie, not real OAuth

`src/auth.ts` registers no adapter, so next-auth v5 uses **JWT sessions**: the
session cookie is self-contained and verified from `AUTH_SECRET` alone. So
`global-setup.ts` mints one directly with next-auth's own `encode()` — using the
library's encoder rather than reimplementing its crypto, so the fixtures stay
correct if the algorithm changes.

Automating the real Microsoft Entra login is deliberately **not** done: it would
need live tenant credentials and MFA.

Two personas are minted, because the gating differs:

| Persona | State file | Used for |
|---|---|---|
| Super admin | `e2e/.auth/super-admin.json` | `/operations/outbound`, `/contacts`, `/activity` |
| Plain staff | `e2e/.auth/staff.json` | Asserting the RBAC redirects |

`e2e/.auth/` is gitignored — it holds live session cookies.

## Send safety

These specs never submit a send. `sendEmailToContactAction` is the real outbound
path, and Requeue / Release-stale-locks / Mark-VERIFIED_READY mutate live queue
state — the compose test stops at "the sheet renders".

Two further guards:

- The app under test runs with every provider credential blanked (`e2e/env.ts`),
  so a send could not authenticate even if one were triggered.
- `safe-database.ts` refuses to seed unless the target is a local/CI host **and**
  the database name contains `e2e` or `test`.

## Run locally

```bash
# 1. throwaway database (isolated from the dev DB and any other project)
docker run -d --name odoutreach-e2e-postgres \
  -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
  -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine

# 2. schema
E2E_DATABASE_URL="postgresql://e2e:e2e_local_only@localhost:5434/odoutreach_e2e?schema=public" \
  DATABASE_URL="$E2E_DATABASE_URL" npx prisma migrate deploy

# 3. browsers, once
npx playwright install chromium

# 4. build, then run
npm run build
npm run test:e2e
```

Playwright starts the app itself (`npm run start`) with the test environment from
`e2e/env.ts`, seeds fixtures, and mints the cookies — no manual setup between runs.

## Overrides

| Variable | Default |
|---|---|
| `E2E_DATABASE_URL` | `postgresql://e2e:e2e_local_only@localhost:5434/odoutreach_e2e?schema=public` |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` |
| `E2E_AUTH_SECRET` | a test-only constant (never a production secret) |
