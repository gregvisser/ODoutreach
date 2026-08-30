# Customer-Ready Report — ODoutreach

**Customer-Ready 7.86/10 — Nearly ready** · **Engineering 8.5/10**
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

**Re-walked 2026-08-29 (cycle 106), dimension 1 only — score UNCHANGED at 8, exactly
as instructed if the walk cannot be completed.** For the first time, a real operator
drove a template, an imported contact and a sequence through the actual screens
(not a staged queue row) across two independent passes with two different real
recipients, and both reached "Ready to launch." Every real launch attempt was
refused by the app itself, before any email left the building, with the identical
on-screen message both times. Traced in the deployed code to a genuine,
reproducible defect: BidlowAI's `Client.defaultSenderEmail` is null, so the mailto
unsubscribe fallback resolves to an empty string and the send-time composition
check marks every send not-ready — a defect no screen in the product can fix
today, since none sets that field. Nothing was sent, confirmed against the
outbound queue counts (unchanged before and after). Full account:
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md`. Weighted total **unchanged
at 7.76** — the score did not move, only the evidence behind it. Named plainly:
the send, the arrival, the reply, and the reply-matching confirmation remain
unproven through the screens.

**Re-walked again 2026-08-29/30 (cycles 109, 110, 117, 120), dimension 1 —
CLOSED at 8, permanently, not re-walked further.** The send leg was proven for
real: an outreach email left the system at 22:45:54 UTC on 2026-08-29, no
bounce, `Sent: 1` on the operator screens
(`docs/ops/SEND-PROOF-2026-08-29.md`). The recipient (Greg, at
greg.visser64@gmail.com) genuinely replied. The reply arrives back in the
product — but is matched to the **wrong** conversation thread, because Gmail
strips the reply-matching alias (`+cycle109`) when a recipient hits Reply
(`docs/ops/REPLY-PROOF-2026-08-30-cycle117.md` and predecessors). That is a
real, reproduced defect in the inbound reply matcher, confirmed independently
in the database (cycle 111), on the operator screens (cycle 112), and again
after a forced on-demand sync (cycle 117). It is not this dimension's row to
fix — it is a separate product defect, not yet its own queue row as of
2026-08-30 — so cycle 120 closed the row **BLOCKED**, holding dimension 1 at 8
until the matcher is fixed and a genuine send→reply→match chain is observed
end to end. No further re-walk will move this score; more observation of the
same broken step produces no new information.

**Re-graded 2026-08-30 (cycle 122), dimension 8 only.** Both of dimension 8's
named inputs (CR-06, CR-05) closed on 2026-08-28, after the 27 August walk
that set the score at 6 — confirmed that 6 was fair *when set*, not wrong.
Re-measured fresh rather than re-read: Sentry's data-collection policy
re-verified live (16/16 tests reading a real `Sentry.init()` client), prospect
PII confirmed not leaving via Sentry today. A **new** carrier was found and
checked: six AI features (shipped 28–29 August) call Anthropic's API, and one
of them would send a real prospect's reply text to that uncovered vendor —
confirmed currently **inert** (`ANTHROPIC_API_KEY` absent from production,
verified live against Azure App Service config; the code refuses before any
network call without it). Dimension 8 moves **6 → 7** — up, because the two
original causes are genuinely fixed and re-verified; not to 8, because a live,
un-gated pathway to a fourth third party now exists, one environment variable
away from firing. Tracked as new open finding **CR-10**. Cycle 122 deliberately
left the weighted total untouched for the next row to recompute.

**Recomputed 2026-08-30 (cycle 123) — pure arithmetic, no dimension re-scored.**
Dimension 1 stayed at 8 (closed BLOCKED, see above); dimension 8 is the only
actual change, 6 → 7. Full weighted sum recomputed with every other dimension
exactly as it stood: **7.76 → 7.86** (+0.10). Gap to the 8.0 sell gate: 0.14.

> **Sell gate: Engineering ≥ 8 AND Customer-Ready ≥ 8. This STILL does not pass.**
> Engineering clears it. **All ten named customer-ready blockers are now closed**,
> and customer-ready is still 0.14 short, at 7.86. Closing every named defect was
> not enough — the honest reading is that one dimension, held at its current
> score by a real, reproduced product defect (the reply-matcher bug), is what
> holds the gate shut now. See "What is actually holding it down" below.

## The headline, plainly

Every named blocker — all ten — is now closed. The product still did **not**
reach 8, and that is the whole point of grading by walking rather than by
counting a closed list: closing every named defect was necessary and it was
still not sufficient. What is left is not an unmeasured unknown: it is one
named, reproduced bug (the reply matcher losing the alias on a Gmail Reply)
holding the single heaviest dimension on the card at 8 instead of 9.

## What is actually holding it down

Every dimension scoring below 9, and why fixing it is not this cycle's to do:

- **(1) Core journeys end-to-end, weight 18, scored 8 — the single heaviest
  dimension on the card, and the only one whose own move alone can open the
  gate.** A real send, a real reply, and a real ingest all happened — but the
  reply matches the wrong thread because Gmail strips the tracking alias on
  Reply. Fix that matcher bug, re-run the chain, and dimension 1 moving 8 → 9
  alone adds 0.18 and lands the total at **8.04** — over the line, with no
  other dimension needing to move. As of 2026-08-30 no queue row yet exists for
  the matcher fix itself.
- **(8) Data safety & trust, weight 10, scored 7 — up from 6 this week
  (cycle 122).** Both original causes are fixed and freshly re-verified. Held
  below 8 because a new, currently-inert pathway (CR-10 — an AI feature that
  would send prospect reply text to Anthropic) exists with no DPA-gate, only an
  absent API key stopping it.
- **(7) Error handling & resilience, weight 10, scored 7.** Network failure
  mid-journey and form validation beyond one flow (the brief save) remain
  unchecked, not broken.
- **(10) Commercial mechanics, weight 4, scored 7.** `/privacy` and `/terms`
  are live and public, but still carry an on-screen "Draft — not yet reviewed"
  notice — whose words go in them is Greg's open question, not an engineering
  gap.

No cycle may invent a higher score for any of these without doing the walk that
would justify it. The honest number is 7.86, and the gap to 8 is real.

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
| 1 | Core journeys end-to-end | 18 | **8** | *(Closed BLOCKED, cycle 120 — not to be re-walked further.)* A real send happened for real (2026-08-29, no bounce, `Sent: 1`) and a real reply arrived back in the product — but matched to the **wrong** thread, a reproduced bug: Gmail strips the reply-matching alias on Reply. Confirmed independently in the database, on the operator screens, and after a forced sync. Held at 8 until the matcher is fixed and the full send→reply→match chain is observed clean; this is the single heaviest dimension on the card and the only one whose own move alone reopens the gate |
| 2 | Nothing half-built in the path | 12 | **8** | All 30 screens render real content — no stubs, no "coming soon", no placeholder text, zero failed requests. Held at 8: two DESIGN.json signature elements are specified and not built (absent, not half-built) |
| 3 | No dev-isms / internal leakage | 10 | **9** | *(Re-graded 2026-08-29, cycle 103.)* Up from 7 — CR-08 closed. The one hit the 30-screen scan found (a raw correlation cuid) is now gated to super admins only, matching the mailbox-diagnostics precedent, and restored to the 9 this dimension held before that hit was found. Caveat: not a fresh full-persona re-scan of all 30 screens — the direct proof is this one page under both personas, red-first in `e2e/journeys.spec.ts` |
| 4 | Professional polish & UX | 12 | **8** | Coherent, real empty states, no layout breakage, no console noise. The design system is now *enforced* by 55 tests computing WCAG 2.2 AA contrast properly. Mobile now checked (cycle 100, CR-09 closed) — four defects found and fixed. Held at 8: three measured contrast defects, unrelated to mobile, still open |
| 5 | Copy & clarity | 8 | **8** | Up from 6 — the contradiction that cost those points is gone, verified on screen. The copy is careful about what it does not promise: *"'Sent from mailbox' means ODoutreach handed the email to the connected mailbox/provider. It does not guarantee inbox placement"*, and Delivered reads "—" with *"Outlook and Gmail do not report this back"* |
| 6 | Onboarding / first-run | 10 | **8** | The client Overview walks a numbered 1–8 setup workflow with per-step status and a "2 / 8 complete" counter, each step explaining in plain English what to do |
| 7 | Error handling & resilience | 10 | **7** | Up from 6. Off-happy-path is now tested, not assumed: a failed brief save shows an inline error and **keeps the operator's typed data**; an unknown id renders 404 disclosing nothing; unauthenticated redirects to sign-in with a callback. Still unchecked: network failure mid-journey, form validation generally, mobile |
| 8 | Data safety & trust | 10 | **7** | *(Re-measured 2026-08-30, cycle 122.)* Up from 6 — both named causes (CR-06, CR-05) confirmed genuinely fixed and freshly re-verified live, not merely closed on paper. Not 8: a new pathway now exists (six AI features, one of which would send a prospect's real reply text to Anthropic) with no DPA-gate — currently inert only because `ANTHROPIC_API_KEY` is absent from production, confirmed live. Tracked as new open finding CR-10 |
| 9 | Reliability & operability | 6 | **8** | Up from 5, then from 7 (cycle 102). Health check ok, monitoring cannot be off by a missing setting, runbook exists, deploys verified by hash. The bounce rate's real writer is now **observed firing in production**: 11 real BOUNCED rows, written after the fix merged — CR-01b closed |
| 10 | Commercial mechanics | 4 | **7** | *(Re-graded 2026-08-29, cycle 99.)* Up from 5. Workspace creation, staff invite/access, soft-delete with recovery and a working support form remain walked. `/privacy` and `/terms` are now live and public, verified by fetching them directly — CR-07 closed. Held at 7, not 8-10: both pages carry an on-screen "Draft — not yet reviewed, and not legal advice" notice, a real customer-visible caveat |

**Weighted total: 786 ÷ 100 = 7.86.** No cap applies.

Movement from 6.8 to the original 2026-08-27 walk's 7.42 was **+0.58**, and it
was not a clean rise: core journeys (+54), copy (+16), operability (+12) and
error handling (+10) went up; dev-isms (−20), data safety (−10) and commercial
(−4) went down, all three on findings that walk made rather than inherited.
Four re-grades since then (cycles 99, 102, 103, 122 — cycle 100 did not move
the total) have added a further **+0.44**: commercial +0.08 (CR-07),
operability +0.06 (CR-01b), dev-isms +0.20 (CR-08), data safety +0.10
(re-measured, cycle 122) — each a single dimension moving on fresh evidence,
not a full re-walk.

## Top blockers — ALL TEN NAMED, NOW CLOSED (one new finding tracked separately)

1. ~~CR-06 — prospect personal data going to Sentry.~~ **CLOSED, cycle 62,
   2026-08-28.** `dataCollection` is now one explicit, tested policy in all
   three entry points. Re-verified live and fresh, cycle 122 — dimension 8
   moved 6 → 7 on the strength of that re-verification.
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

**CR-10 — OPEN, new, found cycle 122.** Six AI features shipped after CR-05/06
closed; one (`classify-inbound-reply.ts`) would send a prospect's real reply
text to Anthropic, with no Art.28 DPA in place. Currently inert —
`ANTHROPIC_API_KEY` is absent from production, confirmed live — but the wall
is an absent key, not a designed compliance gate. Greg's call: pursue a DPA,
add a code-level refusal independent of the key, or both. This is *why*
dimension 8 sits at 7, not 8.

## Fix-to-ready checklist — ordered, cheapest-highest-impact first

1. **Fix the inbound reply matcher so it survives (or recovers from) a Gmail
   Reply stripping the tracking alias, then re-run the send→reply→match chain
   for real and re-score dimension 1.** This is now the *only* single dimension
   move that can open the sell gate on its own: 8 → 9 on weight 18 adds 0.18,
   landing the total at 8.04. No queue row yet exists for the matcher fix
   itself as of 2026-08-30 — that is a gap to queue, not a re-walk to redo.
2. ~~Re-walk dimension 8 (Data safety & trust).~~ **DONE, 2026-08-30 (cycle
   122)** — re-measured live, both original causes confirmed fixed; moved
   6 → 7, not 8, because of the new CR-10 finding above.
3. ~~Gate or drop the correlation id on the outbound detail Routing card.~~
   **DONE, 2026-08-29 (cycle 103)** — gated behind `staff.isSuperAdmin`, same
   pattern as the mailbox diagnostics. Dimension 3 moved 7 → 9.
4. ~~Add a terms of service and a privacy policy page.~~ **DONE, 2026-08-29** —
   live at `/privacy` and `/terms`, linked from the sign-in footer. Dimension 10
   moved 5 → 7 (not 8: still marked Draft, unreviewed).
5. ~~Greg accepts the Sentry DPA.~~ **DONE, 2026-08-28** — signed by Greg in
   the Sentry org's Legal & Compliance settings (CR-05).
6. ~~Check mobile/responsive — never checked, on any pass.~~ **DONE, 2026-08-29
   (cycle 100)** — five key journeys walked at a phone viewport, four real
   defects found and fixed, re-walked clean. Dimension 4 unchanged at 8 (three
   unrelated contrast defects still cap it there).
7. ~~Watch the bounce rate actually fire once live sending resumes.~~ **DONE,
   2026-08-29 (cycle 102)** — 11 real BOUNCED rows observed in production,
   written by the fixed code. Still separately unresolved: whether a bounce
   rate with genuinely zero *new* sends since the fix should render differently
   from a rate with real data behind it — a wording question, not a defect.

**All ten named blockers are now closed, plus one new finding (CR-10, inert).
Item 1 above — fixing the reply matcher — is the only remaining move that, on
its own, reopens the sell gate.**

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
