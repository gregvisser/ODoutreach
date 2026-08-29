# Customer-Ready Report — ODoutreach

**Customer-Ready 7.76/10 — Nearly ready** · **Engineering 8.5/10**
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

**Re-graded again 2026-08-29 (cycle 102), CR-01b only.** A read-only production
probe (`scripts/ops-bounce-path-audit.ts`, run twice — 33257014566 and
33257443587, identical result) found **11 real OutboundEmail rows carrying
status=BOUNCED**, all via the mailbox NDR channel, each written (`updatedAt`)
after the fix merged on 2026-08-27 — proof this code, not a stale row, did the
writing. `MAILBOX_BOUNCE_DETECTION_ENABLED=true` was confirmed directly in the
production App Service config. The probe also corrected the record's own stale
premise: sending did **not** stop on 3 July — the real range is 2026-05-20 to
2026-08-26, 1,361 sends ever, 0 new since the fix merged. Separately checked and
found **not** to be a second inert path: the Resend ESP webhook route is
deployed and reachable (`POST /api/webhooks/resend` → HTTP 503, matching its
own "not configured" guard) but has no `RESEND_WEBHOOK_SECRET` in production —
expected, since Resend only ever served legacy/test rows, not real client
outreach, which goes exclusively via connected Graph/Gmail mailboxes. Dimension
9 moves 7 → 8. Weighted total 7.50 → 7.56.

**Re-graded again 2026-08-29 (cycle 103), CR-08 only — the last open blocker.**
The raw correlation cuid on the outbound email detail page is now gated behind
`staff.isSuperAdmin`, matching the pattern already used for mailbox connection
diagnostics elsewhere in the product (the field carries no operator action — its
own schema comment calls it a duplicate of `id` for provider/webhook correlation
— so it was gated, not deleted, for the same reason that pattern exists). Red-first
in `e2e/journeys.spec.ts`: watched failing against the unfixed page (the row was
visible to ordinary staff), then green after the fix. Dimension 3 moves 7 → 9.
Weighted total 7.56 → 7.76.

> **Sell gate: Engineering ≥ 8 AND Customer-Ready ≥ 8. This STILL does not pass.**
> Engineering clears it. **All ten named customer-ready blockers are now closed**,
> and customer-ready is still 0.24 short, at 7.76. Closing every named defect was
> not enough — the honest reading is that the *weighting*, not a remaining
> blocker, holds the gate shut now. See "What is actually holding it down" below.

## The headline, plainly

Every named blocker — all ten — is now closed. The product still did **not**
reach 8, and that is the whole point of grading by walking rather than by
counting a closed list: closing every named defect was necessary and it was
still not sufficient. What is left is a dimension whose *cause* was already
fixed in an earlier cycle (CR-06, prospect data reaching Sentry) but whose
*score* was deliberately never re-walked to match, plus two dimensions nobody
has claimed as "closed" because their gaps were never named as single fixable
defects in the first place.

## What is actually holding it down

Every dimension scoring below 8, and why fixing it is not this cycle's to do:

- **(8) Data safety & trust, weight 10, scored 6 — the lowest score on the
  card.** Its named cause, CR-06 (prospect PII reaching Sentry), was fixed in
  cycle 62. The *score* was deliberately left at 6 because it was set by a
  customer walk and a merged fix is not the same evidence as re-walking the
  product and seeing the change — see the dimension-8 note in the scorecard.
  Re-walking and re-scoring this dimension alone would move the total to
  roughly **7.96** if it landed at 8. This is unclaimed work, not a new defect,
  and this cycle's instruction was to touch CR-08 only.
- **(7) Error handling & resilience, weight 10, scored 7.** Network failure
  mid-journey and form validation beyond one flow (the brief save) remain
  unchecked, not broken.
- **(10) Commercial mechanics, weight 4, scored 7.** `/privacy` and `/terms`
  are live and public, but still carry an on-screen "Draft — not yet reviewed"
  notice — whose words go in them is Greg's open question, not an engineering
  gap.

No cycle may invent a higher score for any of these without doing the walk that
would justify it. The honest number is 7.76, and the gap to 8 is real.

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
| 3 | No dev-isms / internal leakage | 10 | **9** | *(Re-graded 2026-08-29, cycle 103.)* Up from 7 — CR-08 closed. The one hit the 30-screen scan found (a raw correlation cuid) is now gated to super admins only, matching the mailbox-diagnostics precedent, and restored to the 9 this dimension held before that hit was found. Caveat: not a fresh full-persona re-scan of all 30 screens — the direct proof is this one page under both personas, red-first in `e2e/journeys.spec.ts` |
| 4 | Professional polish & UX | 12 | **8** | Coherent, real empty states, no layout breakage, no console noise. The design system is now *enforced* by 55 tests computing WCAG 2.2 AA contrast properly. Mobile now checked (cycle 100, CR-09 closed) — four defects found and fixed. Held at 8: three measured contrast defects, unrelated to mobile, still open |
| 5 | Copy & clarity | 8 | **8** | Up from 6 — the contradiction that cost those points is gone, verified on screen. The copy is careful about what it does not promise: *"'Sent from mailbox' means ODoutreach handed the email to the connected mailbox/provider. It does not guarantee inbox placement"*, and Delivered reads "—" with *"Outlook and Gmail do not report this back"* |
| 6 | Onboarding / first-run | 10 | **8** | The client Overview walks a numbered 1–8 setup workflow with per-step status and a "2 / 8 complete" counter, each step explaining in plain English what to do |
| 7 | Error handling & resilience | 10 | **7** | Up from 6. Off-happy-path is now tested, not assumed: a failed brief save shows an inline error and **keeps the operator's typed data**; an unknown id renders 404 disclosing nothing; unauthenticated redirects to sign-in with a callback. Still unchecked: network failure mid-journey, form validation generally, mobile |
| 8 | Data safety & trust | 10 | **6** | Down from 7 at the original walk. Isolation genuinely improved (E-06 fixed, BC-01 proven capable of catching a leak, `allowlistedClients: 1` visible in production). The cause named then — prospect data reaching Sentry, CR-06 — was fixed cycle 62, but the score was deliberately NOT moved on a merged fix alone; it needs its own re-walk (unclaimed, see "What is actually holding it down" above) |
| 9 | Reliability & operability | 6 | **8** | Up from 5, then from 7 (cycle 102). Health check ok, monitoring cannot be off by a missing setting, runbook exists, deploys verified by hash. The bounce rate's real writer is now **observed firing in production**: 11 real BOUNCED rows, written after the fix merged — CR-01b closed |
| 10 | Commercial mechanics | 4 | **7** | *(Re-graded 2026-08-29, cycle 99.)* Up from 5. Workspace creation, staff invite/access, soft-delete with recovery and a working support form remain walked. `/privacy` and `/terms` are now live and public, verified by fetching them directly — CR-07 closed. Held at 7, not 8-10: both pages carry an on-screen "Draft — not yet reviewed, and not legal advice" notice, a real customer-visible caveat |

**Weighted total: 776 ÷ 100 = 7.76.** No cap applies.

Movement from 6.8 to the original 2026-08-27 walk's 7.42 was **+0.58**, and it
was not a clean rise: core journeys (+54), copy (+16), operability (+12) and
error handling (+10) went up; dev-isms (−20), data safety (−10) and commercial
(−4) went down, all three on findings that walk made rather than inherited.
Three re-grades since then (cycles 99, 102, 103 — cycle 100 did not move the
total) have added a further **+0.34**: commercial +0.08 (CR-07), operability
+0.06 (CR-01b), dev-isms +0.20 (CR-08) — each a single closed blocker moving
one dimension, not a fresh full walk.

## Top blockers — ALL TEN NOW CLOSED

1. ~~CR-06 — prospect personal data going to Sentry.~~ **CLOSED, cycle 62,
   2026-08-28.** `dataCollection` is now one explicit, tested policy in all
   three entry points. Dimension 8's *score* was deliberately NOT moved by this
   fix alone — see "What is actually holding it down" above.
2. ~~CR-07 — no terms of service, no privacy policy.~~ **CLOSED 2026-08-29.**
   `/privacy` and `/terms` are live, public, and linked from the signed-out
   sign-in footer — verified by fetching the running pages, not by reading the
   merge. Still a draft, not a lawyer-reviewed final: see the scorecard note.
3. ~~CR-08 — a raw correlation cuid, ungated.~~ **CLOSED 2026-08-29 (cycle
   103).** Gated behind `staff.isSuperAdmin`, matching the mailbox-diagnostics
   precedent. Red-first in `e2e/journeys.spec.ts`.
4. ~~CR-01b — the bounce rate has never been observed firing.~~ **CLOSED
   2026-08-29 (cycle 102).** A read-only production probe found 11 real
   OutboundEmail rows carrying status=BOUNCED, all written by the fixed code
   after it merged — see the re-grade note above for the full evidence,
   including the correction that sending did not actually stop on 3 July.
5. ~~CR-05 — the Sentry DPA.~~ **CLOSED 2026-08-28.** Signed by Greg
   (self-serve acceptance); Resend and RocketReach bind automatically via
   their terms — researched, sources recorded.
6. ~~CR-09 — mobile/responsive never checked.~~ **CLOSED 2026-08-29 (cycle 100).**
   Five key journeys walked at a 375×667 phone viewport, four real defects found
   and fixed, re-walked clean. Did not move the weighted total — dimension 4 was
   already held at 8 by three unrelated open contrast defects.

## Fix-to-ready checklist — ordered, cheapest-highest-impact first

1. **Re-walk dimension 8 (Data safety & trust).** The code fix (CR-06 —
   `userInfo`/`httpBodies` now one explicit tested policy, not commented-out
   defaults) was already done in cycle 62. What is still open is re-walking the
   product and re-scoring the dimension to match — the score was deliberately
   left at 6 because a merged fix is not the same evidence as seeing it on a
   fresh walk. Would move dimension 8 from 6 → up to 8, and the total to
   roughly 7.96 if it lands there.
2. ~~Gate or drop the correlation id on the outbound detail Routing card.~~
   **DONE, 2026-08-29 (cycle 103)** — gated behind `staff.isSuperAdmin`, same
   pattern as the mailbox diagnostics. Dimension 3 moved 7 → 9.
3. ~~Add a terms of service and a privacy policy page.~~ **DONE, 2026-08-29** —
   live at `/privacy` and `/terms`, linked from the sign-in footer. Dimension 10
   moved 5 → 7 (not 8: still marked Draft, unreviewed).
4. ~~Greg accepts the Sentry DPA.~~ **DONE, 2026-08-28** — signed by Greg in
   the Sentry org's Legal & Compliance settings (CR-05).
5. ~~Check mobile/responsive — never checked, on any pass.~~ **DONE, 2026-08-29
   (cycle 100)** — five key journeys walked at a phone viewport, four real
   defects found and fixed, re-walked clean. Dimension 4 unchanged at 8 (three
   unrelated contrast defects still cap it there).
6. ~~Watch the bounce rate actually fire once live sending resumes.~~ **DONE,
   2026-08-29 (cycle 102)** — 11 real BOUNCED rows observed in production,
   written by the fixed code. Still separately unresolved: whether a bounce
   rate with genuinely zero *new* sends since the fix should render differently
   from a rate with real data behind it — a wording question, not a defect.

**All ten named blockers are now closed. Item 1 above — re-walking dimension 8 —
is the only remaining move that could open the sell gate, and even that lands
at roughly 7.96, not 8. Something else would still have to move too.**

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
