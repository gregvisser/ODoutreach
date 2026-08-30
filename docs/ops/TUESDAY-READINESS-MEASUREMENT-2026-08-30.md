# The Tuesday readiness measurement — row 114, cycle 154, 2026-08-30

One fresh walk, against one build, on one day, replacing the mosaic that had
accumulated since the 27 August grade. Every number below was re-derived from
what this walk actually saw today — not copied from a prior entry, not
assembled from closed blockers — exactly as the row demanded.

## Prerequisite check, done first

Row 114 may only run once every row above it in `.bidlow/relay/QUEUE.md` is
closed (DONE, BLOCKED or WONTFIX) and row 113 is DONE or BLOCKED on the owner.
Parsed every row in the live queue file (script, not eyeballing — see the
cycle log for the method): **every row is DONE or BLOCKED except row 114
itself.** Row 113 is `BLOCKED 141` — the Anthropic API key is still absent
from production, so its own proof cannot run yet, and it is blocked on Greg,
not on an agent. Four other rows sit BLOCKED on people or clients (92, 84, 48,
110) — none of them TODO, PARTIAL or IN PROGRESS, so none holds this
measurement back. Clear to run.

## What was walked, and how — the same method as the 27 August grade

A full `npm ci`, `npm run db:migrate:e2e` (54 migrations, already applied,
none pending), `npm run build` (webpack, production), then the **entire**
Playwright suite (`npx playwright test`, not just the screen-walk spec) against
the resulting local production server, on **commit `2c1e04f`** — current
`origin/main` at the moment this cycle started. This is deliberately the same
mechanism the 27 August grade used (`e2e/screen-walk.spec.ts` driving a real
Chromium browser against `npm run build && npm run start`), so the two
measurements are comparable.

**94 passed, 1 skipped** (a pre-existing, unrelated training-screenshot skip),
**zero failures**. The screen-walk spec alone rendered **32 staff screens**
(up from 30 at the last full grade — two screens have been added to the walk's
own list since) with **zero console errors, zero page errors, zero failed
requests, an `<h1>` on every screen**, max load 1.9s (cold local server, first
hit). The 5-journey mobile walk at a 375×667 viewport also passed clean, no
new violations.

**Walk-coverage caveat, stated rather than assumed away:** the screen-walk
spec's own list of 32 screens has not grown to match every route in the app.
`/google-reconnects` and `/settings/internal-seed` exist in the production
build (confirmed in `npm run build`'s route table) but are not in the walk's
list, and neither are the nested detail routes (`/clients/[id]/lists/[listId]`,
message/reply detail pages, `/support/[ticketId]`). This walk did not look at
those screens, so nothing here is claimed about them — the score below reflects
the 32 screens actually walked, the same discipline as every prior grade.

## Gates, run and shown

```
npm run lint       → 0 problems
npm run typecheck  → 0 errors (tsc --noEmit)
npm test           → 356 files, 3742 tests — 3741 passed, 1 failed on first run
npm run build      → exit 0, webpack production build
```

The one failing unit test on the first run was
`relay/cycle-log-reaches-git.test.ts`, and it failed for exactly the reason it
exists: `.bidlow/relay/log/cycle-153.md` was sitting untracked on disk (cycle
153 wrote it but the process ended before committing it — the same shape row
121 fixed for cycle 152's log). Fixed the same way that test's own message
says to: `git add .bidlow/relay/log/cycle-153.md`, re-ran the single test file,
green. **3742/3742 once that file is part of this commit** — not a code
change, a bookkeeping one, and the same lesson row 121 already generalised.

## Dimension 1 — held at 8, exactly as instructed, and here is why

The row is explicit: dimension 1 (Core journeys end-to-end, weight 18) may
**not** be scored from this screen walk. It moves only on a dated artefact
under `docs/ops/` proving a human watched a real send arrive, get replied to,
and match back to the right thread. Checked every dated artefact from
26–30 August:

- `docs/ops/SEND-PROOF-2026-08-29.md` — a real send happened, arrived, no bounce.
- `docs/ops/REPLY-PROOF-2026-08-30-cycle117.md` (and predecessors) — the reply
  arrived but matched the **wrong** thread, because Gmail strips the
  `+cycle109` tracking alias on Reply.
- `docs/ops/REPLY-MATCHER-PLUS-ALIAS-FIX-2026-08-30.md` (row 100, cycle 124) —
  the matcher bug that caused the mismatch is now fixed, red-first, unit
  tested. Its own closing section says this in as many words: *"the underlying
  end-to-end journey — a fresh real send, a real human reply, and a correct
  live match — remains UNOBSERVED... That observation is a separate, future
  action — not performed here, and not claimed here."*
- Row 92, the row that owns this observation, is closed `BLOCKED` — not
  re-walked, not re-scored, per its own "stop taking this row" instruction.
- Row 110/118 confirm the structural reason a fresh observation cannot happen
  today even if attempted: **zero Google mailboxes are CONNECTED** in
  production (both `greentheuk` Google mailboxes are stranded). A fresh
  Gmail-side send-and-reply cannot be run to re-close the loop until a Google
  mailbox can send again.

**No dated artefact proves the fixed matcher against a fresh, correctly-linked
reply. Dimension 1 stays at 8**, said explicitly rather than left to be
inferred from silence.

## The other nine dimensions, re-scored from what this walk actually saw

| # | Dimension | Weight | Score | What moved, and why |
|---|---|---|---|---|
| 1 | Core journeys end-to-end | 18 | **8** | Held. See above. |
| 2 | Nothing half-built in the path | 12 | 8 | Unchanged. 32/32 screens render real content, zero stubs, zero failed requests. `DESIGN.json`'s two signature elements (the send rail, live/dry banding) are still specified and not built — absent, not half-built. |
| 3 | No dev-isms / internal leakage | 10 | 9 | Unchanged. Same one hit as every prior walk — a correlation cuid on the outbound-email detail page — correctly gated to `staff.isSuperAdmin` (this walk runs as super admin, so it correctly still shows). `e2e/journeys.spec.ts` still proves it hidden from ordinary staff. |
| 4 | Professional polish & UX | 12 | 8 | Unchanged, but the evidence under it improved: `DESIGN.json`'s open contrast defects dropped from 3 to 2 — the chart-series pair was re-derived and closed on 2026-08-30 (`docs/ops/CHART-SERIES-CONTRAST-2026-08-30.md`). Held at 8, not 9: one real, live WCAG AA text failure remains on the destructive (delete) button variant (3.72:1 at rest against a required 4.5), named in `DESIGN.json.open_defects` and not yet fixed. |
| 5 | Copy & clarity | 8 | 8 | Unchanged. Reporting screen still reads "Sent, confirmed" / "Delivered — Outlook and Gmail do not report this back" rather than overclaiming; Overview carries no Activity contradiction. |
| 6 | Onboarding / first-run | 10 | 8 | Unchanged. The numbered 1–8 setup workflow with a live "2 / 8 complete" counter and per-step plain-English explanations is still there, confirmed in this walk's own artefact (`e2e/.artifacts/screen-walk/client-overview.json`). |
| 7 | Error handling & resilience | 10 | 7 | Unchanged. The failed-brief-save-keeps-typed-data spec, the unauthenticated-redirect spec and the unknown-id-404 specs all still pass. Still unchecked: network failure mid-journey, form validation beyond the brief save, and a genuinely populated mobile send-preparation screen. |
| 8 | Data safety & trust | 10 | **8** | **Up from 7.** CR-10's engineering half is now closed (`docs/ops/CR-10-PROCESSOR-GATE-2026-08-30-cycle125.md`, merged `#420`): `classify-inbound-reply.ts` — the one AI feature that sends a real prospect's own reply text to Anthropic — is now refused by a fourth, code-level check (`isPersonalDataUncovered`) that fires **independently of whether `ANTHROPIC_API_KEY` is configured**, re-verified today by running `metered-call.test.ts` and `classify-inbound-reply.test.ts` (19/19 green) directly against this build. The exact gap that held this dimension at 7 rather than 8 — "the only thing standing between inert and a real leak is an environment variable" — is gone; the wall is now a tested compliance gate, not an accident. That is the whole of the move: exactly undoing the specific reason it was held below 8, no further. Not to 9: the Anthropic Art.28 DPA decision itself (CR-10's commercial half) is still open and unresolved, a genuine standing compliance question rather than a closed one, and `docs/ops/2026-08-30-row116-production-logging.md`'s email-scrubbing hardening (see dimension 9) is counted there, not double-counted here — it is a safeguard on a *new* capability, not evidence resolving an *existing* weakness in this dimension. |
| 9 | Reliability & operability | 6 | 8 | Unchanged, though the evidence under it changed shape. Production logging moved from genuinely dead (App Service logs off, Application Insights wired but never ingesting) to two channels **proven firing with an exact-match live probe** — HTTP access logs and container stdout — plus Sentry's server-action error capture proven end-to-end by a real test, with the newly-live channel's email-address-shaped fields scrubbed red-first before capture went on (`docs/ops/2026-08-30-row116-production-logging.md`). Held at 8, not 9: the actual diagnostic content — the application's own structured error log lines from `src/lib/logger.ts` — has not yet been observed arriving in production (none of its 8 call sites fired during the measurement window), so the most useful signal for a future incident is still unproven, the same class of gap this project keeps finding elsewhere. |
| 10 | Commercial mechanics | 4 | 7 | Unchanged. `/privacy` and `/terms` still return 200 with real content and still carry the on-screen "Draft — not yet reviewed" notice, confirmed again by `e2e/legal-pages.spec.ts` passing against this build. Whose words go in them is still Greg's open question. |

## Show the arithmetic

```
8*18 + 8*12 + 9*10 + 8*12 + 8*8 + 8*10 + 7*10 + 8*10 + 8*6 + 7*4
= 144 + 96 + 90 + 96 + 64 + 80 + 70 + 80 + 48 + 28
= 796
796 / 100 = 7.96
```

## Sell gate

**Requirement: Engineering ≥ 8 AND Customer-Ready ≥ 8.**

- Engineering: **8.5** — re-verified today (lint 0, typecheck 0, full suite
  green once the untracked log was committed, production build green). The
  one named gap is unchanged: nobody has looked at the live Sentry dashboard
  and watched a real production event arrive — row 116 proves the *mechanism*
  end-to-end by test and proves the *channel* firing by a live HTTP-log probe,
  which narrows the gap without closing it. Held at 8.5, not 9, for the same
  reason as before.
- Customer-Ready: **7.96** — up from 7.86 (+0.10), entirely from dimension 8's
  re-score (7 → 8, weight 10); every other dimension held, including dimension
  1, which this row was forbidden from moving.

**SELL GATE RESULT: NOT SATISFIED — by 0.04.** This is the thinnest this gap
has ever been measured, and it deserves to be said plainly rather than rounded
away: **0.04 is not zero.** The requirement is Engineering ≥ 8 AND
Customer-Ready ≥ 8, and 7.96 is short.

**The single heaviest thing holding it down** is still dimension 1, Core
journeys end-to-end — the largest weight on the whole card (18) and the only
dimension this row is explicitly forbidden from moving on the strength of a
screen walk. Moving it 8 → 9 alone would add 0.18, landing the total at 8.14,
comfortably over the line. **But say the other half of this honestly too: the
gap is now so thin that it is no longer uniquely dimension 1's to close.** At
0.04, almost any single dimension gaining one more point closes it alone —
dimension 9 (weight 6) to 9 adds 0.06, dimension 7 (weight 10) to 8 adds 0.10,
dimension 10 (weight 4) to 8 adds exactly 0.04. None of those moves is
supported by evidence this walk found; they are named to be honest about how
close this is, not to suggest a shortcut. Dimension 1 remains the one named
here because it carries the most weight on the card and the clearest,
already-known path to closing it — a fresh, correctly-matched send-reply
loop — not because it is mathematically the only lever left.

**Say this plainly:** nine of the ten dimensions now sit at 8 or above; one
genuine re-score landed today on real, verified evidence (dimension 8); and
the product is 0.04 of a weighted point — not a defect, not a blocker, a
fraction of one point of arithmetic — short of the sell gate, entirely because
of the one dimension this measurement is not allowed to move without watching
the real thing happen.

## The plain-English question, answered directly

**Can someone who has never seen this product run one campaign end to end,
unaided, and can we show the evidence afterwards?**

**No — not with evidence of the whole loop, though most of the way is
provably walkable unaided.**

What IS proven, through the real screens, by an operator with no special
access: importing contacts, building a template and a sequence, enrolling
contacts, and reaching a genuine "Ready to launch" state — all done for real,
unaided, on earlier cycles' walks against this same product
(`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle109.md`). A real send
has also happened for real and arrived with no bounce
(`docs/ops/SEND-PROOF-2026-08-29.md`).

What stops a clean "yes": **the last link in the chain — the reply landing
back against the right conversation — has been observed happening
INCORRECTLY once, and has not yet been observed happening CORRECTLY even
though the bug that caused the wrong link is now fixed.** Until someone sends
a fresh email through the real screens, gets a real reply, and watches it land
against the right thread, the honest answer to "can we show the evidence
afterwards" for the complete loop is no. Separately, and structurally: any
client whose only mailboxes are Google-provider ones cannot run this campaign
at all right now, because zero Google mailboxes are CONNECTED in production
(`docs/ops/2026-08-30-row118-google-mailbox-stranding.md`) — a first-time user
handed a Google-only workspace would stall at the mailbox-connection step, not
at the reply-matching one.

## What this row did, and did not do

Did: a fresh full-suite e2e run against a local production build of current
`main`, re-scored all nine movable dimensions from that evidence plus the
code-level checks each dimension has always relied on, held dimension 1
exactly where its own rule requires, wrote the arithmetic, stated the sell
gate result, and answered the plain-English question. Committed
`.bidlow/relay/log/cycle-153.md`, which was sitting untracked, in the same
commit as this measurement.

Did not: touch any application code, touch the `bidlowai` sequence, cause a
send, decide the Anthropic DPA question, or re-walk / re-score dimension 1.

## The hard rule

No email was sent and no data was deleted for any client. This row read
existing docs/ops artefacts, ran a local build against the e2e fixture
database, and ran unit/e2e tests — nothing left the building for anyone,
`bidlowai` included.
