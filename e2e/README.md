# e2e (Playwright)

BidlowAI Engineering Standard §1.5 — end-to-end coverage of the critical journeys.

## Run

```bash
npx playwright install --with-deps      # once, to get browsers
# point at a running instance (local dev, or a deployed staging URL):
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

`sign-in.spec.ts` runs today with no setup (it only needs the app up).

## Authenticated journeys (`journeys.spec.ts`)

These are `test.fixme` until a signed-in browser state exists. ODoutreach auths via
Microsoft Entra (next-auth), so the standard approach is:

1. Add a `global-setup.ts` that logs in once (or seeds a session cookie for a test
   user against a **test database**) and saves the state with
   `page.context().storageState({ path: "e2e/.auth/user.json" })`.
2. Reference it in `playwright.config.ts`:
   `use: { storageState: "e2e/.auth/user.json" }` and `globalSetup: "./e2e/global-setup.ts"`.
3. Remove `.fixme` from each journey and flesh out the TODOs against the real UI.

Keep `e2e/.auth/` gitignored — it holds a live session.
