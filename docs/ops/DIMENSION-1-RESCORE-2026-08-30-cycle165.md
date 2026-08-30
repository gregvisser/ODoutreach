# Dimension 1 re-score — Core journeys end-to-end — row 128, cycle 165

**Score: 8 → 9. Weighted customer-ready total: 7.96 → 8.14. Sell gate: was
NOT SATISFIED, now SATISFIED — yes.**

## Precondition check, by script, before any scoring happened

Row 128's own rule: start only once every row above it is closed (`DONE`,
`BLOCKED` or `WONTFIX`). Every status cell in `.bidlow/relay/QUEUE.md` for
rows 1–127 was read directly off the file. One was not closed: row 125
carried `IN PROGRESS 159`. Investigated rather than worked around, per this
row's own "if it is wrong, say so" instruction: cycle 159's own log showed
the work was actually finished (cron merged as `11604ed`, PR #455) and the
row was left `IN PROGRESS` only because that cycle ended while waiting on an
asynchronous proof it had no way to come back and report — a relay cycle is
one-shot, so "I'll report back" from inside a finishing cycle is never kept
by anyone. The missing proof (a real scheduled run outside business hours)
has since happened — run `33336908935`, `event: schedule`,
`2026-08-30T21:36:50Z` (a Sunday) — so row 125 is closed `DONE 165` in this
same change, with the evidence filled into its own artefact
(`docs/ops/REPLY-SYNC-ALWAYS-ON-2026-08-30.md`), rather than left to falsely
block this row and every row after it. No new engineering was done for row
125 — this was verification of already-merged work against its own named
definition of done, the same category of correction described in this
project's `CLAUDE.md` under "A row reopened after a relay timeout may already
be merged." Rows 126 and 127 were already `DONE`. With that corrected,
every row above 128 reads `DONE`, `BLOCKED` or `WONTFIX`. Precondition met.

## What this row does and does not do

Per the brief: this does **not** re-walk the 32 screens or re-run the full
Playwright suite — `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`
(row 114, cycle 154, commit `2c1e04f`) already did that and every dimension
other than dimension 1 holds exactly as it stands in `.bidlow/GRADES.json`.
This row reads the new evidence for dimension 1 only, decides the number,
and redoes the arithmetic.

## The evidence that moved the number

`docs/ops/REPLY-PROOF-2026-08-30-cycle156-row123.md` (cycle 156, row 123) and
`docs/ops/SEND-PROOF-2026-08-30.md` (cycle 138, row 115), read together:

- A real introduction email was sent through the real "Launch sequence"
  button on the real production screens (Playwright driving the actual UI a
  staff operator uses, under Greg's own written authorisation in row 115) —
  `OutboundEmail cmtfjse370001g1pf7foi71bf`, sent 2026-08-30T08:28:49Z via
  Microsoft Graph, no bounce.
- Greg himself typed and sent a real reply from a real mailbox
  (`greg.visser64@gmail.com`), not scripted or simulated by any cycle.
- The reply-sync endpoint (triggered manually since 30 August is a Sunday and
  the schedule was weekday-only at that point) linked it —
  `InboundReply cmtg2oyjq007wg1n54us9xzv2` — to the **correct** outbound and
  the **correct** sequence ("Cycle 129 send-and-reply walk — 2026-08-30"),
  confirmed on the live outbound-detail and reply-detail screens, not
  inferred from logs. `stopFollowUpsForLinkedReply` fired and the enrolment
  stopped, the real-world consequence that matters.
- **Greg then read that artefact and looked at the live screens himself**,
  and said in Cowork: "I am satisfied yes" (quoted in row 128's own brief,
  `.bidlow/relay/QUEUE.md` and `.bidlow/relay/CURRENT.md`). This is the exact
  condition every prior scoring pass for this dimension named as the thing
  holding it at 8 and never had: "no human has clicked compose-send-reply
  through the UI" (27–29 August passes); "this dimension may not be scored
  from a screen walk, only from a dated docs/ops artefact proving an
  OBSERVED send-arrival-reply-match, and none exists" (row 114, cycle 154).
  Both conditions are now met, and met by the strongest available form of
  each: a human-typed reply, and the product's own owner watching it land
  correctly.

## Caveat 1 — required by this row's brief, stated and not buried

**The loop is proven, but only on the fallback matching path.** Reading
`process-synced-replies.ts` against what the screens showed
(`REPLY-PROOF-2026-08-30-cycle156-row123.md`, "Which leg fired" section):

- **Leg 1 (`BY_THREAD_REF`), the definitive match on the outbound's own
  Message-ID, did not fire — and structurally could not have.** The send
  went out via Microsoft Graph, and row 105's measurement
  (`docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md`) found Graph
  stamps `rfc822MessageId` on 0 of 267 real sends — Graph's `sendMail` action
  returns no body to read one back from. Row 108's read-back fix closes this
  gap only for **Gmail** sends; it does nothing for Graph.
- **What actually matched was leg 2** — subject-anchored, matching the
  contact's email address against the outbound's subject with the `RE:`
  prefix stripped. This depends on the prospect's mail client leaving the
  subject line intact, which is not guaranteed by any protocol, only by
  common client behaviour.
- Row 110 is the parked fix for the Graph half of leg 1. It was not touched
  by this row.
- **Today, this is not an edge case — it is the normal case.** Row 118
  recorded zero Google mailboxes currently connected in production, so
  Microsoft Graph is presently the only provider real client mail goes out
  through, and leg 1 can never fire for it as the matcher stands today. The
  mechanism actually carrying this proof in production is the fallback, not
  the "definitive" one.

This is weighed honestly below: it is the reason this row does not score a
10, not the reason it fails to move from 8.

## Caveat 2 — required by this row's brief, and now stale in the direction that matters

The brief, written off row 113/cycle 157's finding, said to weigh that "no
real Anthropic call currently succeeds" because every AI feature hitting a
live call failed with HTTP 400 — and to check whether any dimension's score
assumed those features work. Two things follow:

1. **The finding itself is now stale, in the direction that cuts back the
   other way.** Rows 126/160–162 (cycles 160–162, after this row's brief was
   written) re-verified live: `docs/ops/AI-FEATURES-REVERIFY-2026-08-30-cycle160.md`
   shows Greg swapped in a workspace-scoped Anthropic key, and both
   `draft-sequence` and `review-campaign` completed real, paid Anthropic
   calls against `bidlowai` with no HTTP 400. The row 126 header defect is no
   longer the live blocker it was when row 128 was drafted.
2. **It does not change dimension 1 regardless.** Dimension 1 is "Core
   journeys end-to-end" — enrol, launch, send, reply, opt-out — and none of
   that mechanism (`execute-one.ts`, `process-synced-replies.ts`,
   `stop-follow-ups-on-reply.ts`) calls Anthropic or any AI feature. The six
   AI features are separate, optional tooling (draft copy, review a
   campaign, advise on timing) layered on top of the core send/reply loop,
   not a dependency of it. Checked directly: nothing in the dimension-1
   scorecard entry in `.bidlow/GRADES.json`, before or after this row, refers
   to an AI feature. So this caveat is recorded, as instructed, but it does
   not move dimension 1 in either direction. It may be relevant to dimension
   8 (Data safety & trust, which already tracks CR-10's Anthropic-processor
   question) — that is out of scope for this row, which touches dimension 1
   only, and is noted here as a finding for whoever next revisits dimension
   8, not acted on.

## The score, argued from evidence, not decided first

**8 → 9.** Every previous scoring pass for this dimension named the same
missing thing, in the same words, as the reason it could not go above 8: no
human had watched a correctly-matched send-arrival-reply loop. That is no
longer true. The condition was met in the strongest form available to this
product today — a real human-typed reply, correctly linked (not to either of
the two wrong sends this row's own brief was written to guard against), the
real consequence (stopped follow-ups) actually firing, and the product's own
owner independently confirming it by watching the live screens himself. This
is the core job working, end to end, through the provider that carries all
of today's real production traffic.

**Not a 10.** Caveat 1 is real, not decorative: the matching mechanism that
actually did the work in production is the fallback, subject-line-dependent
path, not the definitive Message-ID path — and for Graph sends, the
definitive path cannot fire at all until row 110 is built. A single
successful match, on one contact, in a deliberately-run test, is strong
enough to retire "nobody has watched this work" but not strong enough to
claim the matching mechanism is robust across the variety of subject-line
mangling real prospects' mail clients might do. That gap is named, tracked
(row 110), and left open rather than rounded away.

**Not held at 8.** Holding it at 8 after this evidence would mean the
scorecard's own repeatedly-stated bar — human-observed, correctly-matched
send-arrival-reply — counts for nothing once actually met. The number was
not decided before the arithmetic; the arithmetic follows from evidence that
happens to close the gap, which is not the same thing as being reverse
engineered to close it. If the caveat had turned up a wrong match, a missed
follow-up-stop, or a reply Greg said did not look right, this would still
read 8 and say so.

## The arithmetic, recomputed

Every other line held exactly as `.bidlow/GRADES.json` (row 114, cycle 154)
already has it:

```
was:  8*18 + 8*12 + 9*10 + 8*12 + 8*8 + 8*10 + 7*10 + 8*10 + 8*6 + 7*4
    = 144 +  96 +  90 +  96 +  64 +  80 +  70 +  80 + 48 + 28 = 796
      796 / 100 = 7.96

now:  9*18 + 8*12 + 9*10 + 8*12 + 8*8 + 8*10 + 7*10 + 8*10 + 8*6 + 7*4
    = 162 +  96 +  90 +  96 +  64 +  80 +  70 +  80 + 48 + 28 = 814
      814 / 100 = 8.14
```

Dimension 1 carries the most weight on the card (18 of 100); moving it one
point alone adds 0.18. Customer-ready: 7.96 → 8.14.

## The sell gate

Requirement: Engineering ≥ 8 AND Customer-Ready ≥ 8.

- Engineering: 8.5 (unchanged, not re-measured by this row) — meets the bar.
- Customer-Ready: 8.14 (this row) — meets the bar, for the first time since
  the current scoring method began.

**Is the sell gate satisfied? Yes.**

This does not mean the product is finished, or that every open item
(CR-10's commercial DPA question, the Graph-side leg-1 gap tracked as row
110, dimension 7's untested network-failure paths) is resolved — those
remain exactly as `.bidlow/GRADES.json` already records them, open and
named. It means the two numbers this gate checks both now clear 8, on
evidence gathered today, not on a target reached by rounding.

## Gates

No application code changed by this row — `.bidlow/GRADES.json`,
`.bidlow/relay/QUEUE.md`, this document, and the row-125 artefact placeholder
fill-in only. `npm run lint` and `npm run typecheck` were run anyway, per the
row's own definition of done, and both are 0.

## Scope discipline

Touched: this document, `.bidlow/GRADES.json`, `.bidlow/relay/QUEUE.md` (rows
125 and 128), and `docs/ops/REPLY-SYNC-ALWAYS-ON-2026-08-30.md` (the one
placeholder line row 125 left for later evidence).
`docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md` was not edited, per
the brief's explicit instruction — this supersedes it on dimension 1 only, as
a new dated artefact. No schema, no migration, no send, no client data
touched, no code changed.
