# Cycle 85 — row 80: AI features, slice 1 — metering and reply classification

## The PR sweep, first

`gh pr list --state open` returned exactly one: **#355**, opened by cycle 84 and
left with CI still running. This is the structural failure the brief describes —
a cycle opens a PR, CI takes five minutes, the cycle ends, nobody returns. Both
checks had since passed. `gh pr merge --auto` was refused (auto-merge is
disabled on this repository, `enablePullRequestAutoMerge` errors), so it was
merged manually once the checks were confirmed green: **MERGED 02:34:55Z**.
`gh pr list --state open` now returns `[]`.

Worth recording for the next cycle: **auto-merge does not work here.** The
brief recommends `--auto` as better than update-then-race. It is not available
on this repo, so the sweep must watch and merge, which is what happened.

## The brief was right, and it was also far bigger than one cycle

Row 80 is seven features plus a metering requirement. It is not a task, it is a
phase. The brief itself supplies the ordering and the reason, and it was
followed exactly: metering first because it cannot be retrofitted, then reply
classification because routing a warm reply to a human beats every other item.

Two things in the row turned out to be already settled, and both were checked
rather than assumed:

* **Item 2, "stop the sequence the instant someone replies", was already built.**
  `src/server/email-sequences/stop-follow-ups-on-reply.ts` shipped in PR #137.
  It was verified as genuinely *wired* — called from `ingest.ts:166` and
  `process-synced-replies.ts:251`, with its own tests — not merely present.
* **Most of the wider PHASE-2-SPEC.md is done.** The account grade, the
  autonomous-send toggle, the per-client open-tracking opt-in and the DNS
  verification all have migrations dated 2026-08-28. Only the AI half was open.

## The four things written down before touching anything

1. **Files.** Reconnaissance first, because there was no AI code at all —
   `grep` found no Anthropic, OpenAI or any LLM dependency in `package.json`.
   This was greenfield. New: `src/lib/ai/*` (catalog, taxonomy, switch,
   display), `src/server/ai/*` (metered call, HTTP client, orchestration), one
   migration. Modified: the two ingest paths, the replies query, the replies
   panel, `.env.example`, `prisma/schema.prisma`.
2. **Red-first.** `metered-call.test.ts` and `classify-inbound-reply.test.ts`
   were both written before their modules existed and both watched fail with
   `Cannot find module`. The two *pure* modules were written before their tests,
   so they got this repository's established substitute instead — see below.
3. **Done, in one sentence.** When a reply arrives, the system labels it and
   records exactly what that cost, against the client, so Greg can invoice it.
4. **Not touched.** The send pipeline, suppression, `autonomous-actor-guard.ts`,
   `send-pacing.ts`, tracking, `relay-watch.ps1`, and every queue row but 80.

## Metering is enforced by the type system, not by discipline

The row's strongest instruction is that metering cannot be added later. A
convention that says "remember to record usage" *is* retrofitted metering — the
first call site that forgets is unbilled for ever, and nobody finds out until an
invoice is queried months later.

So `runMeteredAiCall` is the only way this application calls a model, and its
`invoke` callback returns token usage as part of its **return type**. A call
that does not report what it cost does not compile. That is the whole design.

Every outcome writes exactly one `AiUsageEvent`, including the free ones:

* `REFUSED` — switched off, no API key, or no price for the model.
* `ERROR` — the call was made and failed.
* `OK` — tokens × rates.

Recording the refusals is deliberate and is aimed straight at this project's
worst defect. QUEUE.md records six things that were built, wired, reported
success and never fired. A feature that is doing nothing should be *visible* as
doing nothing, and a REFUSED row is what makes "switched off on purpose" look
different from "quietly broken".

## The prices could not be verified, so the design assumes they are wrong

This is the most important honest note in the cycle.

`WebFetch` and `WebSearch` were **both denied** in this session, and the
`claude-api` skill was denied too. So the per-token rates in
`src/lib/ai/model-catalog.ts` are from model knowledge — precisely what the
engineering standard forbids for anything feeding a real-world action, and
issuing an invoice is one.

Rather than ship a confident wrong number, the design makes a wrong price
**recoverable**:

* `RATES_VERIFIED` is `false` and the file says loudly why.
* Every ledger row stores the raw `inputTokens` and `outputTokens`, **both rates
  actually applied**, and a `rateVersion`.
* `model-catalog.test.ts` asserts the stored cost is exactly reproducible from
  the stored numbers.

So if the figures are wrong, every affected row recomputes exactly. The part
that genuinely cannot be reconstructed later — the tokens — is captured
correctly from the very first call. That is the real content of the row's
warning that "retrofitted metering always under-counts".

**Owed:** check the published per-MTok prices, correct them, add a new rate
version, set `RATES_VERIFIED` true.

## Six labels, not the five the row lists

`UNCLEAR` was added on purpose and it is not scope creep. A classifier with no
"I do not know" is forced to guess, and its guesses land on the majority class —
which for cold outreach is rejection. The guess for an ambiguous "sure, send me
something" would be `NOT_INTERESTED`, silently burying exactly the reply the
feature exists to surface. The extra label protects the row's own stated
priority.

The same reasoning drives the failure behaviour throughout: **failing to label
is safe, mislabelling is not.** A prose answer, a refusal, an invented label or
a malformed tool call all parse to `null`, and `null` leaves the reply unlabelled
and routed to a person. The badge for an unlabelled reply says "Not checked yet"
rather than rendering blank, because a blank cell reads as "nothing of interest
here" and an unclassified reply is precisely one nobody has assessed.

The reply body is untrusted text from a stranger on the open internet, arriving
on every single call, so it is fenced in the user turn and the system prompt
says never to follow instructions inside it.

## Proven to fire — by watching it go red

The brief says to assume the seventh exists. Both fire-tests were confirmed
*capable of failing*, then restored:

* Unwiring `classifyInboundReplyQuietly` from `processSyncedMessageForReply`:
  `AssertionError: expected "spy" to be called with arguments:
  [ { replyId: 'reply-classify' } ]` — 1 failed, 33 passed.
* Breaking the refusal path so a switched-off call returned without metering:
  `AssertionError: expected "spy" to be called 1 times, but got 0 times` —
  1 failed, 10 passed.

`processSyncedMessageForReply` is the one that mattered. It is what the
15-minute `sync-replies` cron actually calls for live client mailboxes; wiring
only the legacy ESP-webhook ingest would have labelled **nothing** in production
while every test still passed.

Classification runs last, never throws, and drives nothing. An `UNSUBSCRIBE`
label is a label — the real unsubscribe rail, suppression at queue and dispatch,
per-mailbox caps and the warm-up ramp are all untouched.

## Migration — additive, and merged without asking

3 new enums, 5 nullable columns on `InboundReply`, 1 new table. No drops, no
type changes, no backfill. Dropping what this adds restores today's behaviour
exactly, which is the brief's own test, so it was the relay's to merge.

Generated properly rather than hand-written: a throwaway `shadow_cycle85`
database was created in the **e2e** Postgres container (our own scratch
container on :5434 — not the client DB, and not the other project's database on
:5433), all 48 existing migrations applied to it, the new SQL diffed out,
applied, and re-diffed to confirm **zero drift**. The database was dropped
afterwards.

## Verified live, by hash

* `/api/build-info` on the **direct** App Service URL returns commit
  `96e76d73f4c11cec77366f87b316347cd13620e6` — the merge commit exactly.
* `/api/health`: `{"ok":true,"checks":{"database":"ok"}}`.
* Deploy log: `Applying migration 20260829030000_ai_metering_and_reply_classification`
  against `pg-opensdoors-outreach-prod-01`.

## The one open question, and it is Greg's because it is money

`az webapp config appsettings list` confirms **`ANTHROPIC_API_KEY` is not set**
on `app-opensdoors-outreach-prod`.

So right now, in production, every inbound reply enters the metered path,
refuses with `no_api_key`, writes a REFUSED ledger row, and displays as "Not
checked yet". That is the designed fail-closed behaviour, it is honest on
screen, and it is deliberately not a silent mock — but it means **zero replies
are being classified**.

Setting the key starts real, billable spend that Greg invoices onward. That is
money, which the brief reserves to him, so it was not decided here.

**Question for Greg:** set `ANTHROPIC_API_KEY` in Azure App Service config to
turn reply classification on? Until then the feature is deployed, visible, and
refusing.

## Left for the next cycle — the row stays PARTIAL

Slice 1 of 7. In priority order:

1. **The spend screen.** The ledger is being written and nothing displays it, so
   nobody can yet *see* what to invoice. This is the highest-value next step and
   it is the other half of the row's billing requirement.
2. **The per-client off-switch with attribution.** Only the global
   `AI_FEATURES=off` exists. The spec wants it per client, with a name against
   it. A column with no writer would have been a shell, so it was deliberately
   not added this cycle.
3. Items 3–7: AI-written sequences, campaign quality scoring, AI-chosen send
   times, the rep dashboard, best-message-by-job-title.

## Gates

* `npm run lint` — clean.
* `npm run typecheck` — clean.
* `npm test` — **3264 passed, 323 files**.
* `npm run build` — green.
* `npx vitest run relay/` after editing QUEUE.md — 156 passed, so the queue
  still parses through the real watcher parser.

Open questions: **1** — set `ANTHROPIC_API_KEY` in Azure, or leave the feature
refusing?
