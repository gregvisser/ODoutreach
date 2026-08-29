# Cycle 92 — queue row 80, item 7: best message by job title

**Status: DONE 92.** Row 80's seventh and last item is built, gated, tested and
merged. All six earlier items were already shipped, so this closes the row.

## PR sweep, first

`gh pr list --state open` returned `[]`. Nothing open, nothing to merge, nothing
abandoned. The landfill the brief warns about is empty this cycle.

## What the item asked for, and what the data model would actually support

> (7) best-message-by-job-title

Three things about this application had to be checked before that question could
be answered honestly, and each one changed the shape of the answer. This is the
same kind of correction cycle 91 made to item 6, and for the same reason: the
queue row describes a feature from a generic outreach product, and this is not a
generic outreach product.

**The unit had to be a PERSON, not an email.** A contact enrolled in a campaign
receives five emails over about a month, and item 2 of this same row stops the
sequence the instant they reply. So counting sends would count one person up to
five times — inflating every z-score — and worse, the later steps' audience is
systematically stripped of exactly the people who reply. Comparing step 1's reply
rate against step 4's would have concluded that the first email is the best one,
whatever it said. One enrollment is now one row.

**"Message" had to mean the CAMPAIGN.** Templates and sequences are client-scoped
and every contact in a sequence walks the same steps, so the only copy dimension
that differs between two contacts of one client is which sequence they were
enrolled in. That is the only message comparison this schema can support.

**Job titles are free text and mostly ungroupable.** `Contact.title` is whatever a
CSV or RocketReach record held, so "VP of Operations", "Vice President,
Operations" and "V.P. Ops" are three buckets of one. `title-family.ts` groups
them by fixed rules in code — deliberately not by the model, because the grouping
decides who gets pooled with whom and a grouping that moved between runs would
move the arithmetic under it. Genuinely ambiguous titles ("Director", "Digital
Lead", "Compliance Officer") return `null` and are reported as coverage rather
than swept into an "Other" bucket that would be four unrelated jobs wearing one
name.

## The thing this feature has that the previous five did not

**Multiple comparisons.** The sender comparison compared about three mailboxes.
This compares every campaign inside every job-title family — easily dozens of
cells. At the conventional two-standard-error bar, one comparison in twenty
clears by chance, so a client with forty cells would have been handed roughly two
spurious "winners" on every press of the button, indistinguishable from real
ones. `bonferroniZThreshold` raises the bar in proportion to the number of
comparisons actually made, so the false-positive rate is controlled across the
whole table rather than one cell at a time. The inverse-normal CDF it needs is
Acklam's approximation, written out rather than added as a dependency — the same
call the two-proportion test made.

**A maturity window.** A campaign launched last week has not finished emailing
anyone, so its non-repliers are provisional. That is a systematic error with a
direction: the newest campaign always has the largest share of unfinished
enrollments, so comparing this month's campaign against one that finished in the
spring would have found the older one better every single time. Enrollments
newer than 35 days (day-25 final step, plus ten days for a reply) are excluded.

**Enrollments that never produced a sent email are not counted at all.** Somebody
excluded by suppression, or still PENDING, was never given the chance to reply.
Scoring them as a non-replier would have punished whichever campaign happened to
be pointed at a dirtier list.

## The confound that cannot be fixed, only declared

Nobody was randomised. Each campaign was aimed at a contact list an operator
built by hand, so a campaign that wins with Finance may simply have been given a
better list of Finance people. No amount of arithmetic removes this. It is stated
as fact in the system prompt, the tool REQUIRES alternatives on every finding
(the parser drops a finding that arrives with a single confident cause), and the
panel says it above the table — because by the time somebody has read the numbers
they have already formed the conclusion.

## The guardrail, which is a different one again

Cycle 88 refused the model a sequence's delays, 89 refused a critique replacement
copy, 90 refused the send schedule a field to write into, 91 refused any field
that could rate a person. This feature's danger is the most direct of the six: it
is read as an instruction to rewrite live copy. So the tool schema contains **no
field for suggested copy, a subject line, a rewrite, or a recommended change to
any campaign** — asserted directly against the schema in `title-message.test.ts`.
Draft text arriving with the authority of a statistic is one copy-paste from a
real send.

## Proving it fires, not that it exists

The brief's standing warning — six instances this week of something built, wired,
reporting success and never firing.

* **Red first, genuinely.** `title-family.test.ts` and
  `title-message-evidence.test.ts` both went RED on the first run. Two real
  failures, both in the tests: `normalizeTitle` over-asserted (`&` becomes "and"
  but `/` becomes a space, so `Health/Safety` legitimately differs as a string —
  what matters is that both classify the same, which is now what is asserted),
  and a regex looked for "could not be grouped" against a message that correctly
  reads "None of the job titles … could be grouped".
* **Mutation-tested the two controls that matter.** The server test was green on
  first run, which proves nothing, so the source was deliberately broken twice —
  the never-sent filter neutered, and the distinguishable-pair filter removed.
  Three tests went red, naming exactly the right behaviours. Both breaks reverted.
* **A round-trip test** (`title-message-roundtrip.test.ts`) runs the real
  grouping, the real evidence builder, the real significance test, the real
  request builder, the real HTTP layer and the real parser with only `fetch`
  faked — asserting that the tool schema we SEND and the shape we PARSE are the
  same agreement, and that our verdict actually reaches the model. It also proves
  three spellings of one job ("Operations Manager", "Head of Ops", "Operations
  Director") land in one audience of 1,600.

## A defect found and fixed on the way

The `${family.label} ${message.label}` lookup keys were written to disk with a
raw **NUL byte** where the space should have been. It worked (both sides matched)
but it made the file binary to `grep` and `git diff`. Replaced with
`pairKey(a, b)` = `JSON.stringify([a, b])`, which also closes a real if unlikely
collision: an audience "Finance" and a campaign "Finance — Q3" would collide
under any printable separator, and a collision there would let a finding about a
noise pair pass the filter wearing another pair's verdict.

## Gates — all run, all green

```
npm run typecheck   0 errors
npm run lint        0 errors, 0 warnings
npm test            344 files, 3578 tests passed
npm run build       webpack production build succeeded
```

New tests this cycle: 60 across five files.

## Migration — additive, and therefore mine to merge

`20260829200000_ai_title_message_fit`: one new enum value on `AiFeature` and one
new table `AiTitleMessageReview`. Nothing existing is dropped, altered, rewritten
or backfilled. Dropping what this adds restores today's behaviour exactly — no
code path outside the new panel reads either object, and the send pipeline, the
launch rail, enrolments and targeting do not and cannot. Same shape as the four
`AiFeature` additions cycles 88–91 merged.

## Metering, per the row's build requirement

The call goes through `runMeteredAiCall` with `feature: "TITLE_MESSAGE_FIT"`, so
model, tokens in, tokens out, cost, rate version and client are recorded on the
ledger as it happens — including when the model returns something unusable, since
the tokens were spent either way. The gate runs BEFORE the call, so a client whose
campaigns cannot be told apart costs nothing and produces no ledger row for a call
that never happened.

## What is still true and unchanged

The rate table is still flagged `RATES_VERIFIED = false`. Six cycles have now
failed to reach the published price list (WebFetch denied). Tokens — the part that
cannot be reconstructed later — are recorded correctly, so a corrected rate list
is a recompute rather than lost revenue. This remains an environment block, not a
code one.

`ANTHROPIC_API_KEY` is still absent from Azure, so this feature, like the other
six, is live and refusing. That refusal is correct and visible on its face.

## Open questions: 1

Should the AI features be given a key in Azure? All seven items of row 80 are now
built, gated and deployed, and all seven refuse at runtime for want of a key. That
is a money decision and a client-billing decision, so it is Greg's, not mine.
