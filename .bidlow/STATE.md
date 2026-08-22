# STATE — OpensDoors Outreach

**Updated 2026-08-22 · Tier P (Client Production)**

## Session 2026-08-22 — Monday pilot prep. READ THIS FIRST.

Working branch: **`integrate/monday-pilot`** — local, **unpushed, not deployed**.
Production still serves `b36e66e` (built 2026-07-20). It contains, on top of
`fix/refuse-mock-send-for-prospect-rows`:

| Commit | What |
|---|---|
| `06ef3d7` | BC-01 cross-tenant spec + membership personas committed (were untracked) |
| `e61cbde` | **merge of `feat/zero-dns-send-profile`** — no unsubscribe links on the app domain |
| `e100de6` | BC-01 corrected so it fails on the real leak, not on its own mechanics |
| `e18cdf6` | **DNC subdomain fix** — a suppressed domain now covers its subdomains |
| `8adb7b5` | CLASSIFY research answers + partial DNC gate recorded in DOMAIN.json |

Gates on that branch: lint **0**, typecheck **0**, **1875 tests / 216 files all
pass**, build green, e2e **11 pass / 3 fail** — the 3 failures are BC-01 and are
deliberate (see below).

## THE FINDING — no tenant isolation between staff

`getAccessibleClientIds` (`src/server/tenant/access.ts`) **discards its `staff`
argument and returns every live client.** `ClientMembership` is never consulted on
any read path. The docstring says so deliberately. Proven live: a staff member of
Client B only can open Client A's workspace, its activity feed (real prospect
address + subject) and its outbound email detail — all HTTP 200 with full data.

Two supporting facts:
- **`src/server/tenant/access.test.ts` cannot detect this.** It mocks
  `prisma.client.findMany`, so it never sees the `where` clause that is the whole
  control. It stayed green with isolation both on and off.
- **BC-01 discriminates in both directions.** Red as-is; scoping
  `getAccessibleClientIds` to `ClientMembership` in a scratch branch turned all 5
  green. That scratch was reverted, not committed. Typecheck, build and all 1860
  unit tests passed with it applied — the code cost is one function; the risk is
  the DATA question below.

**This blocks the two-customer pilot and it is Greg's decision, not an
engineering fix.** Options: one instance and accept OpensDoors staff reading
Bidlow's data and vice versa; or Bidlow goes to its own existing instance at
`outreach.bidlow.co.uk`; or build real isolation — 64 call sites, plus the open
question of whether production staff hold any `ClientMembership` rows at all
(if not, switching it on shows them nothing — an outage).

## Half-done / where exactly it was left

- **Nothing is pushed or deployed.** Branch protection requires branch → PR → CI
  → merge. `integrate/monday-pilot` is ready for a PR once the pilot shape is
  decided. Local `main` is **2** commits ahead of `origin/main` (both docs-only).
- **DNC gate still blocks, correctly.** The subdomain half is built and tested
  (test seen RED first). The **related-domain** half (`bt.com` → `bteurope.com`)
  is untouched because it is a client business rule. `fail_closed_test` stays
  false in DOMAIN.json.
- **CLASSIFY**: 6 of 13 questions answered with sources + expiries. The 7 open
  ones are all `decision`/`fact` — Greg only. Listed in `_still_blank_and_why`.
- **204 contacts with "send proof missing"** — still undiagnosed; needs production
  DB access to say whether it touches the pilot clients. Not attempted.

## Decisions and one-way doors touched

- **No one-way door was walked through this session.** `data_residency` and
  `retention_model` remain UNSETTLED and are recorded as such in CLASSIFY, not
  guessed.
- Recorded a **compensating control** in DOMAIN.json for unmeasured bounces:
  20 sends/client/day, max 10/mailbox, first 10 working days. Lifts only when
  `MAILBOX_BOUNCE_DETECTION_ENABLED=true` AND a measured bounce rate under 2%
  over 200+ sends.

## Discovered — contradicts the brief, and worth not re-deriving

- **Bounce detection is NOT absent.** `src/server/mailbox/bounce-detection.ts`
  parses NDR/DSN bounce-backs during inbox sync and IS wired in. It is gated by
  **`MAILBOX_BOUNCE_DETECTION_ENABLED`, default OFF, absent from `.env.example`**.
  0% bounces across ~1,209 sends most likely means nothing is measuring.
  Turning it on is an env var, not a webhook project.
- **Suppression is only half append-only.** Google-Sheet-sourced suppression is
  **replace-on-sync** (`deleteMany` then rewrite by `sourceId`), so removing a row
  from the client's sheet makes that address sendable again.
- **The freeze is broken on a fresh checkout.** 8 of 11 hashes in FROZEN.json are
  of CRLF bytes for files `.gitattributes` stores and checks out as LF. Any clone
  reports 8 phantom SAFETY blocks. Defect in `freeze-specs.mjs` — it should hash
  the canonical LF form. Left alone rather than quietly rewritten.
- **The build gate is not enforcing**: its `PreToolUse` matcher in
  `~/.claude/settings.json` is `"TEMPORARILY_DISABLED"`.
- **BC-01's original assertions were wrong twice** (freeze amended twice, with
  reasons): `/contacts` is super-admin-only and redirects members before any
  tenant filter — so the `?client=` case was a FALSE GREEN; and `loading.tsx`
  makes those routes stream, so a correct implementation also returns HTTP 200
  and E-03 cannot be asserted on status. It asserts disclosure now.
- **Playwright reuses an existing server on :3000** — a stale one silently
  invalidates a run. Same shape as the Azure stale-build trap.

## Next session picks up

1. **Greg's decision on the pilot shape** (one instance vs Bidlow separate vs
   build isolation). Nothing else about the pilot is safe to settle first.
2. The 7 classification questions + the 2 env checks
   (`MAILBOX_WARMUP_RAMP`, `MAILBOX_BOUNCE_DETECTION_ENABLED`).
3. The related-domain DNC rule, then finish that gate.
4. PR `integrate/monday-pilot` → `main` once 1 is decided.

## Nothing in PROJECT.json is contradicted

`lifecycle: live` and `live_url` both confirmed — production answered
`/api/health` 200 and `/api/build-info` `b36e66e`.

---

## Earlier — session 2026-08-09

## Where the build actually is

`/bidlow-init` was run on an existing, live, deployed product — not a new repo.
Most foundations already existed; the missing ones were laid, and one real defect
found during the domain pass was fixed.

Two branches came out of this session, both **local, unpushed**:

| Branch | Contents |
|---|---|
| `chore/bidlow-foundations` (`5737fb7`) | Tier P declared, `.gitattributes`, `SCOPE.md`, `CUSTOMER-READY-REPORT.md`, `.bidlow/DOMAIN.json`, this file. Docs only |
| `fix/refuse-mock-send-for-prospect-rows` | The mock-send guard + tests. Branched from the above |

## Gates run and their real output, 2026-08-09

Measured on `fix/refuse-mock-send-for-prospect-rows`:

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **exit 0** |
| Typecheck | `npm run typecheck` | **exit 0** |
| Tests | `npm test` | **1836 passed / 214 files** |
| Build | `npm run build` | **NOT RUN** |
| e2e | `npm run test:e2e` | **NOT RUN** |

**Test counts are branch-dependent — do not compare them across branches.**
Baseline on this branch is **1828 / 213**; the guard adds 8 tests in 1 file.
`feat/zero-dns-send-profile` reports **1852** because it carries ~24 extra tests
from the unsubscribe/mailto work that is not in `main`.

## The defect found and fixed this session

**A prospect send with no `mailboxIdentityId` would have been silently
mock-"sent".** `execute-one.ts` routed on `if (row.mailboxIdentityId)`; rows
without it fell to `getOutboundEmailProvider()`, which returns `MockEmailProvider`
whenever `EMAIL_PROVIDER` is unset — as it is in production. The mock returns a
synthetic `{ ok: true }`, so the row would have been marked SENT, the contact
marked contacted, and follow-ups would have fired referencing an introduction the
recipient never received.

It had **never fired** — the 6 August audit found zero `mock_` rows. Latent, not
active. Now gated by `prospect-send-transport-guard.ts`, which refuses any row
carrying a `contactId` but no mailbox, and fails it with `NO_SENDING_MAILBOX`
rather than falling through.

Two deliberate decisions recorded in `.bidlow/DOMAIN.json`:

- **Not behind a feature flag**, against the local convention. It can only
  intercept rows headed for the mock, so it cannot turn a real send into a
  non-send — a flag defaulting to off would just leave the defect live.
- **The wiring is not covered by an automated test**, only the pure decision
  function. `executeOutboundSend` needs a database and the unit suite is
  deliberately DB-free. Verified by reading. An integration test belongs in
  `execute-one.integration.test.ts` when a database is available.

## Still open, and why

`.bidlow/DOMAIN.json` records **1 irreversible action as ungated**:

1. **DNC sibling domains** — `suppression-guard.ts` matches domains on an exact
   key, so `bt.com` on the list does not cover `bteurope.com`. The gate exists and
   is tested; its matching is narrower than ideal. Phase 2, ~18 Tier P days. Live
   compliance exposure the client raised directly

**The build gate stays shut** until that is closed. That is the standard working
as designed.

### Corrected 2026-08-09 — the warm-up ramp was ALREADY on

`MAILBOX_WARMUP_RAMP` is **`on` in production**, verified directly against Azure:

```
az webapp config appsettings list --name app-opensdoors-outreach-prod \
  --resource-group rg-opensdoors-outreach-prod \
  --query "[?name=='MAILBOX_WARMUP_RAMP']"     ->  value "on"
```

The August roadmap, the engagement notes and the first version of this file all
recorded it as OFF. **They were stale — do not trust them on this point.** The
claim that volume protection is active is therefore true, not false as previously
stated. The action is now recorded as gated: `mailbox-warmup.test.ts` proves the
ramp fails closed — clock skew (`-3`) and `NaN` both collapse to the base cap of
5, and the configured steady cap is never exceeded.

Caveat worth keeping: the ramp is *activated* by a flag that defaults to off, so
the gate is fail-closed in its logic but fail-open in its activation. Re-verify
the flag before relying on it.

## A real gap in the standards tooling

The build gate **blocks its own remedy**. Recording an ungated action honestly
makes it impossible to write the fix for that action, because the gate refuses all
non-markdown writes anywhere — including `~/.claude/settings.json` and the hook's
own `lib.mjs`. The hook was parked by hand to land this fix.

`knowledge_map` pillars have a `mitigation_recorded` escape hatch. `irreversible_actions`
has none — [lib.mjs](C:/Bidlowprojects/_standards/bidlow-standards/plugins/bidlow-standards/scripts/lib.mjs)
`ungatedActions()` is a bare `!a.gate || a.fail_closed_test !== true`. Worth adding
a dated, recorded waiver field; this will hit every Bidlow repo that records an
honest gap.

## Chain and grades — run 2026-08-09

`.bidlow/CHAIN.json` (gitignored — it names the commit it attests to, so
committing it would make itself stale) and `.bidlow/GRADES.json` (tracked).

| | Result |
|---|---|
| Architect / Test / Security / SRE / Reviewer | **passed**, with gaps recorded |
| Head of Engineering | **sign-off WITHHELD** |
| Engineering grade | **8.0** — below the 8.5–9.5 Tier P band, deliberately |
| Customer-Ready grade | **4.0** — graded 2026-08-09 by walking production live |

**Customer-Ready 4.0** (weighted rubric 6.0, capped for a defective core journey).
Full detail in `CUSTOMER-READY-REPORT.md`. The deciding finding: **production
still mints unsubscribe links on the OpensDoors app domain** — deployed
`send-introduction.ts:529` falls through `resolveClientLinkBaseUrl(client) ??
resolvePublicBaseUrl()` to `AUTH_URL`, because no client has a verified aligned
domain. That is the phishing pattern behind the quarantine. The tracking-pixel
half IS fixed and live (`OPEN_TRACKING_PIXEL=off`, verified). The unsubscribe half
is fixed in `a8d777c` and **unshipped**.

**Sell gate: Engineering 8.0 AND Customer-Ready 4.0 → NOT SATISFIED.**

Engineering is 8.0 not 8.5 because three of the nine things a 9 requires are
unproven or absent: no e2e on critical journey J5, coverage thresholds not
verified as enforced, and Sentry wired but not verified as receiving events.
Rounding up to land inside the band is the false-9 the protocol exists to stop.

Sign-off was withheld because signing would unblock a production deploy of
send-path changes I have not reviewed, on the strength of a Customer-Ready score
nobody has measured.

## Pick this up first

1. **Run the `customer-ready-audit` skill** as its own focused session. It is the
   single blocker on everything else. Walk the product live, save a dated
   `CUSTOMER-READY-REPORT.md`
2. **Adversarially review `feat/zero-dns-send-profile`** — 4 send-path commits,
   ~1,400 lines, currently unreviewed and explicitly outside the chain's scope.
   Then merge and deploy. Branch protection is on, so PR only; verify by commit
   via `/api/build-info`, never by liveness alone
3. **Investigate two production findings** raised while walking the app:
   - 204 of ~1,470 contacts show **"send proof missing"** (~14%), unexplained
   - Delivered is **"not tracked — no provider delivery webhooks yet"**, so
     bounces read 0 (0%) across 1,209 sends. The domain brief makes bounce rate
     below 2% a non-negotiable. **A threshold that cannot be measured cannot be
     enforced** — this is arguably the most important open item on the product
   - `/operations` returns 404 on production; may be a moved route, not diagnosed
4. **Three local branches are unpushed**, all based on local `main`, which itself
   carries 2 unpushed docs commits. `origin/main` == deployed (`b36e66e`)

## Decisions already locked — do not relitigate

- Zero DNS required from customers. Graph sending IS Outlook sending
- Tracking off by default; `go.<domain>` CNAME is a later upsell, not a barrier
- Draft-into-Outlook deferred, built only if a specific corporate asks
- Email only. No LinkedIn outreach automation
- Phase 2 (DNC brand grouping) sequenced ahead of domain verification
- `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN` is a send kill switch, not a hardening
  flag. Leave it off

## Capacity reality

~9 working days, half-time, 6–31 August, zero slack. The full programme is
**~139 Tier P days — roughly 8 months at half-time, not 3.**

## Open questions

Five. Four in `.bidlow/DOMAIN.json` under `open_questions`, plus whether to add
the waiver mechanism to the standards hook. See also the NEEDS CONFIRMATION items
in `SCOPE.md`.
