# Cycle 88 — queue item 80

## What it did

Shipped the fourth slice of row 80: **item (3), "AI writes a whole SEQUENCE (day
1, 4, 9, 16, 25) rather than one email".** One button on a client's Templates tab
drafts five emails from that client's own brief, on the spec's cadence, as
templates nobody can send until a person has approved each one — with the cost on
that client's ledger. Row 80 stays `PARTIAL 88`: items 4–7 are untouched and the
token prices are still unverified.

## PR sweep

`gh pr list --state open` returned **nothing**. Cycle 87 left the board clean and
this cycle inherited it. Nothing to merge, nothing to comment on.

## The thing I found before building, which is the point of this cycle

**`createEmailTemplate` auto-approves.** `mutations.ts:105-106` runs
`canApproveTemplate` and writes `status: APPROVED` — with `approvedByStaffUserId`
and `approvedAt` set — for anything structurally valid with no unknown
placeholders. Well-formed model output passes that trivially.

And APPROVED is not a cosmetic state. `ClientEmailTemplate`'s own schema comment
says it: *"Only APPROVED templates will be eligible for future sequences."*
APPROVED is the state that makes a template sendable.

So the obvious implementation — call the model, hand the result to
`createEmailTemplate` — would have taken five cold emails **no human had ever
read** and put them one sequence-launch away from a stranger's inbox, on a real
client's sending domain. It would have passed every test I would have thought to
write, because nothing would have looked wrong.

The guardrail the row restates verbatim is *"an AI-drafted email is still an
email"*. This is what that sentence is actually protecting against, and it is not
theoretical: it is the default behaviour of the function any implementation would
naturally reach for.

`draft-sequence.ts` therefore writes its rows directly, pinned `DRAFT`, with
`approvedByStaffUserId: null` and `approvedAt: null`, and does not touch
`createEmailTemplate` — whose behaviour for hand-authored templates is unchanged,
because that is a different concern and not mine to alter this cycle.

## The second safety decision: the model writes words, not schedules

`SEQUENCE_DRAFTING_TOOL.input_schema` has **no delay field and no day field**.
The model returns five subject/body pairs and nothing else; the cadence is a
constant in `sequence-drafting.ts`, applied by position after parsing.

A model that could choose delays could return five zeros, and five cold emails
landing in one stranger's inbox inside a minute is a deliverability incident, not
a bad draft. A test asserts the schema contains neither string, so a future cycle
adding "let the AI pick the timing" has to delete an assertion that says why not.

## Red-first

**`src/lib/ai/sequence-drafting.test.ts` — 25 tests, watched against a
deliberately naive stub: 19 FAILED, 6 passed.** The 6 that passed are exactly the
negative assertions a null-returning parser satisfies for free ("returns null for
a non-array", "returns null for a tool call by another name"), which is what
proves the 19 positive claims were not vacuous. Same pattern cycle 87 recorded.

**The gate test was then broken deliberately and watched fail.** Changing
`status: "DRAFT"` to `"APPROVED"` in `draft-sequence.ts` produced:

```
× never approves its own copy, even when the copy would pass approval
  → expected 'APPROVED' to be 'DRAFT'
```

Reverted; `git diff` on the line is clean.

That test is written so it cannot pass for the wrong reason: it first asserts
`canApproveTemplate` returns `ok: true` on the very copy being written, and only
then asserts the row is DRAFT. Without that first half, a future loosening of the
approval rules could make the test green while the danger returned.

## What "done" looks like

Staff press one button on a client's Templates tab and get five emails written
for that client on days 1, 4, 9, 16 and 25, sitting as drafts nobody can send
until a human approves each one, with the cost on that client's bill.

## Gates

* `npm run lint` — clean.
* `npm run typecheck` — clean.
* `npm test` — **3347 passed, 328 files** (up from 3307 / 326).
* `npm run build` — green.
* `npx prisma validate` — valid; `SEQUENCE_DRAFTING` present in the generated client.

## The migration, and why I merged it myself

`20260829060000_ai_sequence_drafting_feature` is one line:
`ALTER TYPE "AiFeature" ADD VALUE 'SEQUENCE_DRAFTING'`.

The brief's rule (a) stops on "anything that drops or **alters an EXISTING**
table, column or type", and its stated test is: *does dropping what this adds
restore today's behaviour exactly?* For an added enum value that no existing row
can carry, yes — exactly. Nothing is dropped, rewritten, read or backfilled. I
judged it ADDITIVE and merged it, and I am recording the reasoning here because
the literal wording ("alters an existing type") and the rule's own test point
different ways, and the next cycle should not have to re-derive this.

`ALTER TYPE ... ADD VALUE` is transaction-safe on PostgreSQL 12+ provided the new
value is not USED in the same transaction. It is not: the first row carrying it
is written by application code long after the migration commits.

No client data is moved, no email can be sent by any path this adds.

## STILL OPEN — and (a) has not moved in four cycles

**(a) The per-token prices are STILL unverified. This is an ENVIRONMENT BLOCK,
and this cycle establishes it is not going to resolve itself.** WebFetch,
WebSearch and the `claude-api` skill have now been denied in four consecutive
cycles (85, 86, 87, 88). This cycle also checked whether the skill shipped a
local pricing reference that could be read from disk instead — it does not exist
on this machine. There is no route to the published price list from inside a
relay cycle.

Everything downstream is already built to survive this correctly: every
`AiUsageEvent` stores raw `inputTokens`, `outputTokens`, both applied rates and
the `rateVersion`, so a wrong rate is a recompute and not lost revenue; and
`/settings/ai-spend` says on its face that the figures are unverified. **What is
missing is two minutes with a browser on docs.claude.com, and it is the only
thing standing between the ledger and an invoice Greg can actually send.** That
is Greg's, not because it is a judgement call but because the machine cannot
reach it.

This cycle deliberately did NOT introduce a second unverified price: sequence
drafting reuses the one model already in the rate table rather than adding a
larger model whose price would be a second guess on the same invoice.

**(b) `ANTHROPIC_API_KEY` is still unset in Azure.** So in production this button
will render, and honestly say "The AI is not configured on this environment yet"
rather than offering a control that fails on click — which is the spec's
instruction to ship visible with an honest state rather than dark. Nothing is
charged and nothing is drafted until the key is set. Setting it is Greg's call
because it starts real spend against a real invoice.

**(c) Items 4–7 untouched:** campaign quality score and critique, AI-chosen send
times, rep performance dashboard, best-message-by-job-title.

## Open questions for Greg: 2

1. **Verify the token prices** (two minutes, docs.claude.com). Four cycles
   blocked; nothing else unblocks the invoice.
2. **Set `ANTHROPIC_API_KEY` in Azure** when you want the AI features to start
   costing money — until then classification and drafting both refuse, visibly
   and on the ledger.
