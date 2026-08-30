# Cycle 122 - queue item 93

## First: the PR sweep

`gh pr list --state open` returned zero open PRs at cycle start. Nothing to
merge, nothing to comment on.

## What was found on disk before touching anything

`git status` at session start showed uncommitted modifications to
`.bidlow/relay/QUEUE.md` (row 93's status cell already flipped from `TODO` to
`IN PROGRESS 122` - the picker's own dispatch marking) and
`.bidlow/relay/log/cycle-121.md` (176 lines added - the watcher's own
automatic end-of-cycle appendix for cycle 121, never committed), plus the
same untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` that cycles 120 and 121
both found and correctly left alone as unrelated to any row. This matches the
exact shape cycle 121's own log described finding from cycle 120 - legitimate
prior record left uncommitted, not stray work - so it is carried forward in
this cycle's commit rather than discarded or redone.

## The four things, written down before acting

1. **Files to change:** `.bidlow/GRADES.json` (dimension 8's scorecard entry,
   the blockers list, and `questions_for_greg` - nothing else in that file),
   `.bidlow/relay/QUEUE.md` (row 93's status cell), and this log. The
   already-present uncommitted `cycle-121.md` appendix travels in the same
   commit as legitimate prior record.
2. **Red-first test:** does not apply in the usual sense - this is a grading
   task, not new code, and there is nothing to make go red. The substitute is
   re-running the same live-client mechanism CR-06's original evidence used
   (`sentry-config-wiring.test.ts` / `sentry-data-collection.test.ts`) fresh
   today rather than citing the old result, and independently verifying a
   fact (whether `ANTHROPIC_API_KEY` is live in production) rather than
   trusting a memory note that said it was absent.
3. **Done looks like:** dimension 8's entry states plainly whether 6 was fair
   when set on 27 August, states a new score with fresh evidence rather than
   re-citing CR-06/CR-05's closure text, and no other dimension, the
   arithmetic, the weighted total or the sell gate changes.
4. **Not touched:** engineering section, any other customer-ready dimension,
   `arithmetic`, `weighted_total`, `sell_gate` (all three explicitly reserved
   for row 94), any code, any migration, any client data, any email.

## Answering Greg's question first

Was 6 fair on 27 August? Yes. Checked both named inputs' actual merge/sign
dates against the 27 August walk date: CR-06's fix is commit `47692b9`,
authored 2026-08-28 09:43 (the day after); CR-05's Sentry DPA was signed
2026-08-28 per its own evidence text. Neither existed on 27 August, so the
walk that set the 6 could not have seen either fix - it was measuring a real,
uncovered leak that genuinely existed that day. This is recorded as a score
that went stale, not one that was wrong, per the row's own distinction.

## Re-measuring, not re-reading

Confirmed production is running commit `062e21e` (via
`curl https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info`,
the direct App Service origin) and that `47692b9` (CR-06's fix) is an
ancestor of it (`git merge-base --is-ancestor`).

Re-ran, today, the same mechanism CR-06's original evidence used rather than
citing that evidence: `npx vitest run src/lib/monitoring/sentry-config-wiring.test.ts
src/lib/monitoring/sentry-data-collection.test.ts` - 16/16 green, including
the assertion that reads `userInfo`/`httpBodies` back off a real,
initialised `Sentry.init()` client as `false`. Grepped all three entry points
(`sentry.server.config.ts`, `sentry.edge.config.ts`,
`src/instrumentation-client.ts`) and confirmed all three still wire the same
shared `SENTRY_DATA_COLLECTION` policy - no drift since the fix. Also
confirmed via `git log --since=2026-08-28` that none of those files have
changed since. This is genuine re-measurement: the test was executed fresh
against the current tree, not read as a past result.

## Checking for a new carrier, as instructed

Searched for anything that has begun sending prospect data to a third party
since the 27 August walk. Found: six AI features (`src/server/ai/*`, queue
row 80) merged 2026-08-28/29 (after both CR-06 and CR-05), all of which call
Anthropic's Messages API via `src/server/ai/anthropic-messages.ts`
(`POST https://api.anthropic.com/v1/messages`). Read each of the six:

- `classify-inbound-reply.ts` sends a real prospect's subject line plus up to
  2,000 characters of their actual reply body, verbatim, to Anthropic - a
  genuine carrier of "message bodies" in the row's own language, and
  potentially of a name or address a stranger signed the reply with.
- `explain-rep-performance.ts` sends only the CLIENT's own sending-mailbox
  display name/address and aggregate send/reply/bounce counts - not a
  prospect's data.
- `advise-title-messages.ts` sends only an aggregated job-title bucket
  (`contact.title`), not a name, address or individual message.
- `review-campaign.ts`, `draft-sequence.ts` and `advise-send-times.ts`
  operate on the client's own template copy and aggregated statistics.

So exactly one of the six is a genuine prospect-PII carrier by the row's own
test. No Art.28 DPA exists for Anthropic - CR-05 covered only Sentry, Resend
and RocketReach.

Checked whether this pathway has actually fired, live rather than assumed:
`az webapp config appsettings list --name app-opensdoors-outreach-prod
--resource-group rg-opensdoors-outreach-prod` (az cli confirmed authenticated
first) lists all 38 real app settings by name; `ANTHROPIC_API_KEY` is not
among them. Read `src/server/ai/metered-call.ts`, which all six AI features
route through with no other path to Anthropic, and confirmed
`if (!apiKey) return refuse("no_api_key")` runs before any network call.
Grepped all six feature files and confirmed each passes
`apiKey: process.env.ANTHROPIC_API_KEY` into that same gate - no feature
bypasses it. So the pathway is real in the deployed code and currently inert,
confirmed by measuring the actual production configuration rather than
trusting the memory note that said so.

## The score

7, not held at 6, not moved to 8. Up because the two causes of the 6 are now
genuinely fixed and were freshly re-verified this cycle, not merely cited as
closed. Not to 8 because this pass surfaced something the 27 August walk
could not have seen: a live, deployed pathway that would carry a real
prospect's message text to an uncovered fourth third party the moment one
environment variable is set, gated by nothing that checks for a DPA - only by
an absent key. That is the same "built, wired, would fire" shape this
project keeps finding, currently facing the safe direction by accident of
configuration rather than by design.

## What was written

`.bidlow/GRADES.json`: dimension 8's scorecard entry rewritten with the above
(score 6 -> 7); a new blocker `CR-10` (status OPEN, owner `greg`) recording
the Anthropic finding and the two possible fixes (a DPA, or a code-level
compliance gate); `questions_for_greg` gained one entry for CR-10, and
`open_questions` moved from 1 to 2. Diffed the file before committing to
confirm ONLY dimension 8, the blockers array and `questions_for_greg`
changed - `engineering`, every other scorecard dimension, `arithmetic`,
`weighted_total` (still 7.76) and `sell_gate` are byte-identical to before
this cycle, confirmed with `node -e` reading the JSON back and with a
grep over the diff for `"n":`/`"dimension":` occurrences (only n:8 appears).

`.bidlow/relay/QUEUE.md`: row 93's status cell only, from `IN PROGRESS 122`
to a `DONE 122` entry stating the fair-when-set answer, the fresh
measurement, the CR-10 finding, and the new score, in that order.

## Gates

`npm run lint` -> 0 errors. `npm run typecheck` -> 0 errors.
`npm test` -> 348 files, 3649/3649 tests green.

## Commit

`.bidlow/GRADES.json`, `.bidlow/relay/QUEUE.md`, `.bidlow/relay/log/cycle-121.md`
(carried forward, previous cycle's own record) and this log, committed
together via branch -> PR -> green CI -> merge. Docs/data-record-only
change; none of the three ask-first conditions apply (no migration, no
client data touched, no email sent).
