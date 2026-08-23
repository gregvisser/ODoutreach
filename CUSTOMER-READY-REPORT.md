# Customer-Ready Report — ODoutreach

**Customer-Ready 6.8/10 — Demo-able, not sale-ready** · **Engineering 8/10**
**Graded 2026-08-23** by walking the `integrate/monday-pilot` build in a real
browser with a real session. Supersedes the 2026-08-09 grade of **4.0**.

> **Sell gate: Engineering ≥ 8 AND Customer-Ready ≥ 8. This does not pass.**
> 6.8 is not a pass mark. It is an honest description of a product that works
> and is unusually well written, but whose numbers cannot yet be trusted and
> whose core job was not walked end to end.

## What moved it from 4.0, and what did not

The 4.0 was **capped**, not weighted: *"a core customer journey is broken →
cap 4.0"*, applied because production minted unsubscribe links on the OpensDoors
app domain while `From:` was the customer's own domain — the phishing pattern
that caused the quarantine. **That defect is fixed and tested on this branch**
(`e61cbde`), so the cap no longer applies and the weighted score is what stands.

**No cap applies to this build.** Checked each: no broken core journey observed;
no cross-customer leakage (BC-01 is green and was proven capable of catching
one); no customer-facing dev-isms; no placeholder content in the product; health
check and monitoring exist.

The uncapped 2026-08-09 figure was 6.0. This is 6.8 — the difference is almost
entirely **onboarding and empty states, which were previously unproven and are
now verified**, plus a correction to the `/operations` finding.

## How this was walked, and the limitation that matters

Thirteen pages in Chromium with a real super-admin session against the branch's
production build: Reports, Clients, New client, and a client's Overview, Brief,
Mailboxes, Do-not-contact, Sources, Lists, Templates, Outreach and Activity,
plus Universe, Blocked contacts, Operations, Settings and Support.

**Every page returned HTTP 200. Zero console errors and zero page errors across
the whole walk.**

**The limitation, stated up front:** this walked a *fixture* database — four
near-empty workspaces — not production's seventeen clients with real volume. It
therefore **cannot see data-scale problems**, and two findings from the previous
pass could not be confirmed or refuted here (see "Not checked"). A fixture walk
is strong evidence about empty states and weak evidence about scale.

## Scorecard

| # | Dimension | Wt | Score | What was actually observed |
|---|---|:--:|:--:|---|
| 1 | Core journeys end-to-end | 18 | **5** | The blocking defect is gone and every surface renders and navigates. But **the core job — compose, send, get a reply — was never completed on this build.** No real send was performed, correctly so. Graded down for the unknown, not for an observed break |
| 2 | Nothing half-built in the path | 12 | **8** | Every linked page renders with real content. **Correction to the previous pass:** `/operations` does return a hard 404, but there is no `/operations/page.tsx` — it is a route segment, not a page, it is linked from nowhere, and `admin-gate.test.ts` asserts it is absent from the nav. It is not in the customer's path |
| 3 | No dev-isms / internal leakage | 10 | **9** | Clean across all thirteen pages. No raw cuids, enums, stack traces or env-var names. The only machine-ish strings (`Legacy transport: mock`, `noreply@opensdoors.local`) are on the admin-only Operations page and reflect the test environment |
| 4 | Professional polish & UX | 12 | **8** | Coherent, structured, no layout breakage seen, no console noise. Client overview carries a numbered 1–7 workflow with per-step status and a "1 / 8 complete" counter. Mobile/responsive not re-checked this pass |
| 5 | Copy & clarity | 8 | **6** | The writing is genuinely excellent — "No email is sent and no contacts are touched when you connect", and Reports states its own methodology ("Live counts from the database — no rollup tables"). Marked down for one real contradiction, below |
| 6 | Onboarding / first-run | 10 | **8** | **Now verified, having been unproven before.** Empty workspaces give real empty states that name the next action: "No sequences yet. Expand 'New sequence' above, then open your draft here to review recipients and launch." The new-client form explains what happens after create |
| 7 | Error handling & resilience | 10 | **6** | Zero console/page errors across the walk; unauthenticated access correctly redirects to `/sign-in`; an unresolvable id renders the 404 UI and discloses nothing (proven by BC-01 R-6). Still untested: bad form input, expired session, network failure |
| 8 | Data safety & trust | 10 | **7** | Materially improved and now *proven*: BC-01 rewritten with 6 passing tests on workspace data isolation, and shown to catch a real leak when the `clientId` scope is removed. Per-client scoping verified live. Held down by E-06, the numbers contradiction, and three unverified DPAs |
| 9 | Reliability & operability | 6 | **5** | `/api/health` ok, Sentry wired, `docs/TEAM_RUNBOOK.md` exists, and CI now records test evidence. But **the bounce rate is the one number the domain brief makes non-negotiable (< 2%) and it cannot be trusted** — see blockers |
| 10 | Commercial mechanics | 4 | **6** | Workspace creation, staff access and soft-delete with recovery all present and walked. ToS / privacy policy still not checked |

**Weighted total: 684 ÷ 100 = 6.84 → 6.8.** No cap applies.

## Top blockers

1. **The bounce rate cannot be trusted, and it is the non-negotiable.**
   `MAILBOX_BOUNCE_DETECTION_ENABLED=true` in production (read live), the NDR/DSN
   path is built and wired into inbox sync — and it still reports **0% across
   1,209 sends**. Something that is switched on is reporting nothing. Until that
   is explained, nobody can say whether sending is damaging a client's domain.
   *This is why the 20/day cap exists: volume is the substitute for measurement.*
2. **The product shows two different truths about the same client.** Reproduced
   on this build: the Overview workflow reads **"7 Activity — not started"**
   while the Activity tab for that same client reads **"EMAILS SENT 1"** and
   **"Total sent (with proof): 1"**. Cause: the overview pill keys off
   `latestActivityLabel` (`src/lib/client-launch-state.ts:254-266`) while the
   Activity tab counts `OutboundEmail`. Two sources of truth for "has this client
   sent anything". An operator who spots this stops trusting every other number.
3. **The core job was never walked end to end.** Setup surfaces are good; nobody
   has driven compose → send → reply on this build. That is the product.
4. **E-06 — one mailbox on two workspaces duplicates raw inbound mail**,
   including full body text, into both. Replies do not cross; the raw store does.
5. **Art.28 DPAs unverified** with Sentry, RocketReach and Resend. RocketReach
   also raises a controller-side lawful-basis question about bought prospect data.

## Fix-to-ready checklist — ordered, cheapest-highest-impact first

1. **Make the Overview and Activity agree.** One source of truth for "has sent".
   Small, and it buys back the trust that currently leaks into every number.
2. **Explain the 0% bounce rate.** Either it is real, or the NDR matcher is not
   linking. One afternoon on production data. Until then the cap holds.
3. **Fix `sentProofMissing`** — `seedExclusion` is applied to the OutboundEmail
   counts but not to the step-send count feeding `allStepSendsSent`
   (`outreach-metrics.ts` ~line 226), so every internal seed send inflates it.
4. **Walk one real send end to end** on a controlled pilot address and record it.
   That is what would move dimension 1 from 5 toward 8.
5. Test the off-happy-path cases: bad input, expired session, permission failure.
6. Close the three DPAs; decide the do-not-contact related-domain rule.
7. Re-check mobile, and add ToS / privacy policy.

## Not checked this pass — so, unproven

- **Anything data-scale.** Two previous findings could be neither confirmed nor
  refuted on a fixture database: the **Campaigns column reading 0** for clients
  with hundreds of contacts, and the contradiction **at production scale** (743
  sends). Both need a walk against production after this ships.
- A real end-to-end send, mobile/responsive, bad input, expired sessions,
  ToS/privacy, and `/operations/outbound` under actual queue load.
- Production itself, deliberately: it still serves `b36e66e` and still carries
  the defect this branch fixes, so grading it again would only re-measure that.
