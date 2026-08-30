# Cycle 165 - row 128

## PR sweep

`gh pr list --state open` returned zero open PRs. Nothing to merge or chase.

## Precondition check (by script, not by eye), before any scoring

Row 128's own rule: start only once every row above it reads `DONE`,
`BLOCKED` or `WONTFIX`. Read every status cell for rows 1-127 directly off
`.bidlow/relay/QUEUE.md` (not from memory or from the brief's own summary).
One row failed: **row 125 read `IN PROGRESS 159`.**

Investigated rather than worked around, per the standing "if it is wrong, say
so and correct QUEUE.md" instruction, and per this repo's own `CLAUDE.md`
guidance on a row reopened after a timeout possibly already being finished.
Cycle 159's own log said: "The merge (`11604ed`) is confirmed on
`origin/main`, gates are green, and the investigation from cycle 158 is
solid. I'm now waiting on a background poll for the first scheduled
`sync-replies.yml` run... I'll report back once it lands." That "report back"
never happened and structurally never could — a relay cycle is one-shot; the
process that said it would report back had already ended. Checked whether
the missing proof now exists: `gh run list --workflow=sync-replies.yml`
showed run `33336908935`, `event: schedule`, started
`2026-08-30T21:36:50Z` — a Sunday, outside the old business-hours cron by
every measure. That is exactly the proof row 125's own definition of done
asked for. It failed overall, but only on an unrelated step (a different
client's DNC sheet sync hitting a Google 502, confirmed by reading
`gh run view 33336908935 --log-failed`, not the badge). So row 125 was
functionally complete and only ever missing a status update — no new
engineering, pure verification against its own already-written definition of
done. Closed it `DONE 165` in this same change, and filled the one
placeholder line `docs/ops/REPLY-SYNC-ALWAYS-ON-2026-08-30.md` had been
left with, with this evidence.

Rows 126 and 127 already read `DONE`. With row 125 corrected, the
precondition was met and this row's actual work could proceed.

## The work

`docs/ops/DIMENSION-1-RESCORE-2026-08-30-cycle165.md` is the full record:
evidence, both required caveats, the arithmetic, and the plain sell-gate
answer. Summary: dimension 1 (Core journeys end-to-end, weight 18) moved
8 -> 9 on the strength of `docs/ops/SEND-PROOF-2026-08-30.md` +
`docs/ops/REPLY-PROOF-2026-08-30-cycle156-row123.md` — a real, human-typed
reply landing and correctly matching the right send and the right sequence,
with follow-ups actually stopping, plus Greg personally reading that
artefact, watching the live screens, and saying in Cowork "I am satisfied
yes." That is the exact, named condition every prior scoring pass on this
dimension held it at 8 for. Weighted customer-ready total: 7.96 -> 8.14.
Sell gate (Engineering >= 8 AND Customer-Ready >= 8): **SATISFIED, yes** —
Engineering held at 8.5 (not re-measured, per this row's own instruction not
to re-walk the 32 screens or re-run the full suite), Customer-Ready 8.14.

Both caveats the brief required are in the artefact and in the
`.bidlow/GRADES.json` entries, not just in this log: (1) the match fired on
the fallback leg (subject-anchored), not the definitive Message-ID leg,
which cannot fire on Microsoft Graph sends at all as the matcher stands
today, and Graph is currently the only provider carrying real traffic; row
110 is the parked fix. (2) row 113/126's Anthropic HTTP-400 finding, which
the brief said to weigh, is now itself stale — fixed in cycles 160-162
(`docs/ops/AI-FEATURES-REVERIFY-2026-08-30-cycle160.md`) — but it never
applied to this dimension regardless, since the core send/reply/opt-out
mechanism does not call any AI feature; checked directly against the code
rather than assumed.

The number was not decided first. If the reply had matched the wrong thread,
or Greg had not confirmed it, or the core mechanism had turned out to depend
on the now-fixed (at the time, broken) Anthropic path, this would still read
8 and this log would say so.

## Files changed

`.bidlow/GRADES.json` (dimension 1 score/observed text, arithmetic,
`weighted_total`, `sell_gate` block, `movement_this_regrade`, `customer_ready.score`/`band`),
`docs/ops/DIMENSION-1-RESCORE-2026-08-30-cycle165.md` (new),
`docs/ops/REPLY-SYNC-ALWAYS-ON-2026-08-30.md` (filled in the one placeholder
line, row 125's own artefact), `.bidlow/relay/QUEUE.md` (rows 125 and 128
status cells). No application code touched.

## Gates

`npm run lint` -> 0 problems. `npm run typecheck` -> 0 errors.
`npm test` -> 362 files / 3772 tests, all green (no application code changed,
run anyway per the standing per-cycle rule). JSON validated with
`node -e "JSON.parse(...)"` after every edit to `.bidlow/GRADES.json`.

## What I did not do

Did not re-walk the 32 screens or re-run the full Playwright screen-walk
suite, per the row's explicit instruction — `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`
is untouched. Did not touch dimension 8 even though the now-fixed Anthropic
key changes the shape of CR-10's "inert but real" risk (the pathway is no
longer inert) — that is a real observation but out of scope for this row,
which names dimension 1 only; noted in the artefact as a finding for
whoever next revisits dimension 8, not acted on here. Did not send any
email, did not touch client data, did not run a migration.

## Scope note on row 125

Closing row 125 was not this row's assignment, but leaving it `IN PROGRESS`
would have permanently blocked this row and every row after it that checks
the same precondition by script — `IN PROGRESS` is not a status the relay
picks back up the way `PARTIAL` is, so nothing would ever have revisited it
on its own. The closure was pure verification against row 125's own,
already-written definition of done, not new engineering, and is recorded
here and in row 125's own status line rather than folded silently into row
128's log.
