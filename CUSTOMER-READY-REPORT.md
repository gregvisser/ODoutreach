# Customer-Ready Report — ODoutreach

**Customer-Ready 7.5/10 — Nearly ready** · **Engineering 8.5/10**
**Graded 2026-08-27** against commit `b15cfe4`, by walking 30 staff-facing
screens in a real browser against a local production build.
Supersedes the 2026-08-23 grade of **6.8** (engineering 8.0).

**Re-graded 2026-08-29 (cycle 99), CR-07 only — not a full re-walk.** PR #302
(merged 2026-08-28) shipped `/privacy` and `/terms`, already live on production
commit `3bdf6f5`. Verified live rather than trusting the merge: both routes
return 200 on the custom domain and the direct App Service origin, with real
content (not a stub) and footer links reachable from the signed-out `/sign-in`
page. Dimension 10 moves 5 → 7 (held back from 8-10 by an on-screen "Draft —
not yet reviewed, and not legal advice" notice). Weighted total 7.42 → 7.50.
See `.bidlow/GRADES.json` → `customer_ready.movement_this_regrade` for the exact
arithmetic.

**Re-graded again 2026-08-29 (cycle 100), CR-09 only.** Mobile was measured for
the first time: a new merge-blocking spec (`e2e/mobile-walk.spec.ts`) drives
five key journeys at a 375×667 phone viewport and found four real defects, all
fixed and re-walked clean (a sub-12px monogram tile, sub-12px snapshot labels, a
mailbox table row inflated by a wrapped button column, and a customer-facing DNS
record chopped mid-word). Weighted total **unchanged at 7.50** — dimension 4 was
already held at 8 by three unrelated open contrast defects, so closing CR-09 did
not move the number, only the evidence behind it. See `.bidlow/GRADES.json` →
`customer_ready.blockers[CR-09]` for the full account, including what was
deliberately left unmeasured (the send-prep panel's populated four-at-a-time
state, and every viewport but one).

> **Sell gate: Engineering ≥ 8 AND Customer-Ready ≥ 8. This still does not pass.**
> Engineering clears it. Customer-ready is 0.5 short. Two blockers remain open:
> CR-08 (a raw correlation id) and CR-01b (the bounce path has never been
> observed firing — an agent cannot close this, it requires a real send). CR-07
> and CR-09 are closed.

## The headline, plainly

Every named blocker from the last grade is closed. The product did **not** reach 8
anyway, and that is the whole point of grading by walking: closing the list was
necessary and it was not sufficient. Opening the product found three problems
nobody had written down, one of which means **prospects' personal data is leaving
the building right now**.

The good news is that all three are cheap. None is a redesign.

## How this was walked

`e2e/screen-walk.spec.ts` opened **30 staff-facing screens** as a signed-in super
admin against a production build (`npm run build` → `npm run start`), recording
each screen's rendered text, load time, console errors, page errors and failed
requests to `e2e/.artifacts/screen-walk/*.json`. The grade below is read off those
artefacts, not off the code.

**All 30 screens passed**: every navigation under HTTP 400, **zero page errors,
zero console errors, zero failed requests**, a real `<h1>` on every screen, no
error-boundary text, no unrendered Markdown. The full e2e suite is **61 passed**.

**The limitation, stated up front:** this walked a *fixture* database — four
near-empty workspaces — on a *local* build, not the live site with seventeen real
clients. Strong evidence about rendering, copy, empty states, leakage and error
paths. Weak evidence about data scale. Load times (1.3–5.9 s) are local numbers
measured with eight parallel workers hitting a cold server; treat them as a floor
for production, not a prediction of it.

## Scorecard

| # | Dimension | Wt | Score | What was actually observed |
|---|---|:--:|:--:|---|
| 1 | Core journeys end-to-end | 18 | **8** | Proven twice: a real email left the system 2026-08-26 12:16:36 UTC through the real queue worker with its raw MIME inspected, **and** the enrol→launch→send→reply→opt-out chain is covered by a merge-blocking test proven capable of failing. Was 5. Not higher because the browser walk is navigation-only — no human has clicked compose→send→reply on this build |
| 2 | Nothing half-built in the path | 12 | **8** | All 30 screens render real content — no stubs, no "coming soon", no placeholder text, zero failed requests. Held at 8: two DESIGN.json signature elements are specified and not built (absent, not half-built) |
| 3 | No dev-isms / internal leakage | 10 | **7** | A scan of all 30 rendered screens for raw enums, env-var names, cuids and stack traces returned **exactly one hit** — a raw correlation cuid (CR-08). Everything else clean. Down from 9 because the previous 13-page pass never opened that screen |
| 4 | Professional polish & UX | 12 | **8** | Coherent, real empty states, no layout breakage, no console noise. The design system is now *enforced* by 55 tests computing WCAG 2.2 AA contrast properly. Mobile now checked (cycle 100, CR-09 closed) — four defects found and fixed. Held at 8: three measured contrast defects, unrelated to mobile, still open |
| 5 | Copy & clarity | 8 | **8** | Up from 6 — the contradiction that cost those points is gone, verified on screen. The copy is careful about what it does not promise: *"'Sent from mailbox' means ODoutreach handed the email to the connected mailbox/provider. It does not guarantee inbox placement"*, and Delivered reads "—" with *"Outlook and Gmail do not report this back"* |
| 6 | Onboarding / first-run | 10 | **8** | The client Overview walks a numbered 1–8 setup workflow with per-step status and a "2 / 8 complete" counter, each step explaining in plain English what to do |
| 7 | Error handling & resilience | 10 | **7** | Up from 6. Off-happy-path is now tested, not assumed: a failed brief save shows an inline error and **keeps the operator's typed data**; an unknown id renders 404 disclosing nothing; unauthenticated redirects to sign-in with a callback. Still unchecked: network failure mid-journey, form validation generally, mobile |
| 8 | Data safety & trust | 10 | **6** | **Down from 7 — the finding of this pass.** Isolation genuinely improved (E-06 fixed, BC-01 proven capable of catching a leak, `allowlistedClients: 1` visible in production). But prospect personal data is being sent to a third party right now — CR-06 |
| 9 | Reliability & operability | 6 | **7** | Up from 5. Health check ok, monitoring cannot be off by a missing setting, runbook exists, deploys verified by hash. The bounce rate finally has a real writer — but it has never been seen firing, because nothing has sent since 3 July |
| 10 | Commercial mechanics | 4 | **7** | *(Re-graded 2026-08-29, cycle 99.)* Up from 5. Workspace creation, staff invite/access, soft-delete with recovery and a working support form remain walked. `/privacy` and `/terms` are now live and public, verified by fetching them directly — CR-07 closed. Held at 7, not 8-10: both pages carry an on-screen "Draft — not yet reviewed, and not legal advice" notice, a real customer-visible caveat |

**Weighted total: 750 ÷ 100 = 7.50 → 7.5.** No cap applies.

Movement from 6.8 is **+0.58**, and it is not a clean rise: core journeys (+54),
copy (+16), operability (+12) and error handling (+10) went up; dev-isms (−20),
data safety (−10) and commercial (−4) went **down**, all three on findings this
pass made rather than inherited.

## Top blockers

1. **CR-06 — prospect personal data is going to Sentry right now.**
   `sentry.server.config.ts` and `sentry.edge.config.ts` are unchanged installer
   scaffolding with `userInfo: false` and `httpBodies: []` left **commented out**,
   so the SDK defaults apply. On this product that means prospect names, email
   addresses and **the bodies of real outreach and real replies** are collected
   into error reports sent to a third party — one whose Art.28 DPA is not yet
   accepted. The DSN is hard-coded, so this is not switchable off by config.
   `tracesSampleRate: 1` samples 100%, which is volume and cost on top.
2. ~~CR-07 — no terms of service, no privacy policy.~~ **CLOSED 2026-08-29.**
   `/privacy` and `/terms` are live, public, and linked from the signed-out
   sign-in footer — verified by fetching the running pages, not by reading the
   merge. Still a draft, not a lawyer-reviewed final: see the scorecard note.
3. **CR-08 — a raw correlation cuid, ungated.** On the outbound email detail page,
   in a "Routing" card. It is **not** super-admin gated — `journeys.spec.ts:95`
   explicitly asserts ordinary staff can open that page.
4. **CR-01b — the bounce rate has never been observed firing.** The structural
   defect is fixed and both channels now write through one function, but nothing
   has sent since 3 July, so no real NDR has moved the number off zero. A fix that
   has not fired is this project's most repeated defect class.
5. **CR-05 — the Sentry DPA** (Greg's, one self-serve acceptance; Resend and
   RocketReach bind automatically via their terms — researched, sources recorded).
6. ~~CR-09 — mobile/responsive never checked.~~ **CLOSED 2026-08-29 (cycle 100).**
   Five key journeys walked at a 375×667 phone viewport, four real defects found
   and fixed, re-walked clean. Did not move the weighted total — dimension 4 was
   already held at 8 by three unrelated open contrast defects.

## Fix-to-ready checklist — ordered, cheapest-highest-impact first

1. **Uncomment two lines in two files** (`userInfo: false`, `httpBodies: []`) and
   choose a real `tracesSampleRate`. Removes the personal data from error
   monitoring **without** removing the monitoring. Moves dimension 8 from 6 → 8.
2. **Gate or drop the correlation id** on the outbound detail Routing card, or
   show it only to super admins as the mailbox diagnostics already are. Moves
   dimension 3 from 7 → 9.
3. ~~Add a terms of service and a privacy policy page.~~ **DONE, 2026-08-29** —
   live at `/privacy` and `/terms`, linked from the sign-in footer. Dimension 10
   moved 5 → 7 (not 8: still marked Draft, unreviewed).
4. Greg accepts the Sentry DPA when Sentry is back up.
5. ~~Check mobile/responsive — never checked, on any pass.~~ **DONE, 2026-08-29
   (cycle 100)** — five key journeys walked at a phone viewport, four real
   defects found and fixed, re-walked clean. Dimension 4 unchanged at 8 (three
   unrelated contrast defects still cap it there).
6. Watch the bounce rate actually fire once live sending resumes; decide whether
   "0%" with no data behind it should render as "no data yet" instead. A confident
   wrong number is worse than a blank.

**Items 1–2 together would land customer-ready at roughly 8.1 and open the sell
gate; item 6 cannot be done by an agent (rule (c), no send).**

## Not checked this pass — so, unproven

- **Anything data-scale.** Two long-standing findings could again be neither
  confirmed nor refuted on a fixture database: the Campaigns column reading 0, and
  the numbers contradiction at production scale.
- The send-preparation screen's *populated* four-at-a-time state (the fixture
  client has no active sequence, so only its clean empty state was walked), and
  every viewport but 375×667.
- Network failure mid-journey; form validation beyond the brief save.
- Whether Sentry is actually *receiving* events — the dashboard was in a partial
  outage on 2026-08-27. This is also the last gap between engineering 8.5 and 9.
- A human clicking compose → send → reply through the UI. The chain is covered by
  a test and was performed once for real; it has not been *driven* by a person.
