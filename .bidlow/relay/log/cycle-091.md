# Cycle 91 — queue item 80, sub-item 6: comparing the senders

**Shipped:** PR #367 — `feat(ai): compare a client's sending mailboxes, refusing
to explain noise`.

## The PR sweep

`gh pr list --state open` returned `[]`. Nothing to merge, nothing abandoned.
Cycle 90 closed its own PRs (#364, #365, #366) before ending, which is the
behaviour the standing instruction is trying to produce.

## What I found before writing anything, and why it changed the build

The queue asks for a "rep performance dashboard with AI explaining the
differences". Two facts about this application had to be checked before that
could be built honestly. Both were checked against the schema and the send code,
not assumed, and both changed what the screen is allowed to claim.

**A "rep" in this product is a MAILBOX, not a salesperson.** `mailboxIdentityId`
is the only per-sender dimension anywhere on a send. It appears on outbound mail,
a per-mailbox sync cursor and a send-quota ledger — and on nothing that holds
copy. There is no rep, no owner, no territory, no assignment of prospects to
people anywhere in the data model.

**Nobody here writes their own email, chooses their recipients, or sets their
volume.** Sequences and templates are client-scoped, so every sender in a
workspace sends identical words. And the mailbox is not picked per prospect:
`resolveGovernedSendingMailboxFromRows` (src/server/mailbox/sending-policy.ts:157)
takes the primary connected mailbox, or the first connected one that can send. So
volume differences are an artefact of which mailbox is flagged primary and which
were connected that week, and each sender's audience is whatever happened to be
queued while their mailbox was the available one.

The consequence is direct: **a difference between senders in this product cannot
mean "this person writes better email" — the words are identical — and it cannot
mean "this person works harder", because no human chose the volume.** What it can
legitimately mean is that one MAILBOX's mail is arriving and another's is not:
broken authentication, a reputation hole, an unfinished warm-up, a dead token.
That is a real and expensive problem for this client — only 27 of 55 live
mailboxes could send when it was last measured — and it is what I built.

I did not narrow the item to avoid it. I built the comparison the row asked for,
across every sender, with the AI explaining the differences. I framed it as a
comparison of mailboxes because that is what the data supports, and the panel
says so in its first two sentences.

## The thing this feature is really guarding against

A table of named colleagues sorted by reply rate is evidence in a performance
conversation whatever the heading says. Cold-outreach reply rates are low single
digits, so on the volumes a capped mailbox achieves, one sender on 8% and another
on 4% is the overwhelmingly likely outcome of **two senders who are exactly the
same**. A screen printing those two numbers next to two people's names, under a
fluent AI paragraph explaining the gap, manufactures a performance problem out of
a coin toss.

So the arithmetic decides which gaps are real before the model is asked to
explain anything. `compareRateToPool` is a two-proportion z-test of each sender
against every other pooled, threshold |z| ≥ 2. Written out in six lines rather
than pulled from a statistics package — a dependency on a billing-adjacent screen
has to earn itself. Replies and bounces are tested **separately**, because a
mailbox bouncing far more than its peers is a deliverability fault, and folding
that into one "performance" verdict is how somebody gets sent to a coaching
conversation about a broken DNS record.

Three layers enforce that rather than request it, because a prompt is advice and
only structure is a control:

1. **The tool schema has no field for a score, rating, rank, grade or any action
   about a person.** A `rating` column would be read as a judgement this
   application had made about an employee, on data that cannot support one. The
   test asserts against the *schema*, not a response — a field that exists will
   eventually be filled; one never defined cannot be.
2. **The parser drops a finding that offers a single confident cause.** The
   prompt asks for alternatives; if they do not arrive the finding goes, because
   a lone cause attached to a named person's mailbox reads as a diagnosis.
3. **The server drops any finding naming a sender our own arithmetic marked as
   within normal variation.** This is the only guard that survives the model
   ignoring every instruction it was given.

The model is also told four facts it cannot know and would otherwise get badly
wrong — same words, no choice of recipients, no choice of volume, a sender is a
mailbox. Without them the fluent, plausible, completely false answer is "Alex
writes better subject lines".

## Metering

Per the row's standing requirement, metered from the first commit rather than
after. The call goes through `runMeteredAiCall`, so model, tokens in, tokens out,
cost and client land on the ledger as `REP_PERFORMANCE` — including refusals,
which is how "off on purpose" stays visibly different from "silently stopped
working". A client with too little sending is refused **before** any money is
spent and before anything is written about anybody.

## Proving it fires, not that it exists

The brief's standing demand, and the defect this project is worst at.

* **Red first, watched.** `rep-performance-evidence.test.ts` was written and run
  before the module existed — `Cannot find module './rep-performance-evidence'`.
  Its central assertion is that a 4%-versus-8% gap on 150 sends each is reported
  `indistinguishable`.
* **The new server drop-guard was proven capable of failing.** I replaced the
  filter with `const findings = parsed.findings` and re-ran: exactly the two
  tests that cover it went red (`expected [ { …(4) } ] to have a length of +0 but
  got 1`), the other eleven stayed green. Restored, 13/13 green.
* **A round-trip test** runs the real evidence builder, real significance test,
  real request builder, real HTTP layer and real parser with only `fetch` faked —
  and asserts the significance verdict actually reaches the prompt. That line
  could be deleted today and every other test in the feature would stay green.

## Gates — all four run, output seen

```
npm run lint       clean
npm run typecheck  clean
npm test           3518 passed across 339 files
npm run build      ✓ Compiled successfully in 30.5s
```

(The build prints `GlobalBrandSetting` auth errors from local Postgres. That is
the documented local DB drift, not a build failure — the build reports success
and the page falls back to defaults.)

## Schema — additive, so mine to merge

One new enum value (`AiFeature.REP_PERFORMANCE`) and one new table
(`AiRepPerformanceReview`). Nothing existing is dropped, altered, rewritten or
backfilled; dropping what this adds restores today's behaviour exactly. Nothing
outside the new panel reads either object — the send pipeline and the mailbox
rows are untouched, asserted by a test that fails if this ever grows a route to
a mailbox row.

`PRODUCTION_PRISMA_MIGRATE` is true, so merging applies it to the live database.
That is expected and sanctioned for an additive migration.

## Nothing was sent

No email left the building for any client. The feature reads history and writes
prose; it has no route to the send pipeline.

## Where item 80 now stands

Done: (1) reply classification, (2) stop on reply, (3) AI-written sequences,
(4) campaign quality score, (5) AI-chosen send times, (6) this.

**Left: (7) best-message-by-job-title.** The row stays `PARTIAL` so the next
cycle picks it straight back up.

## One thing for Greg, unchanged from four cycles ago

`ANTHROPIC_API_KEY` is still not set in Azure. Every AI feature — classification,
drafting, review, send-time advice, and now this — is live, wired and
**refusing**, visibly, on the ledger. Nothing is broken; nothing has been
switched on. Setting that key is the moment these start costing money, and it is
your call, not mine.

The model prices in `model-catalog.ts` are still flagged
`2026-08-29-unverified` — entered from model knowledge because WebFetch was
denied, now across five cycles. The tokens are recorded correctly, so any wrong
rate is a recomputation rather than lost revenue, and `/settings/ai-spend` says
so on its face. It still wants a human to check the published prices before an
invoice goes out.
