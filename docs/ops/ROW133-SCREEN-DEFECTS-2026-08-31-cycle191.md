# Row 133 — three screen defects Greg named on 31 August

Cycle 191, 2026-08-31. Each of the three was investigated and measured before
any line was changed, per the row's instruction. No `.bidlow/GRADES.json`
edit, no dimension, no sell gate touched.

## Finding 1 — the AI sequence grade never closes

**Confirmed, and fixed.**

`src/components/clients/email-sequences/ai-campaign-review-panel.tsx`
rendered every reviewed sequence's `ReviewBody` fully expanded, in whatever
order the `sequences` prop arrived in, with no collapse control at all.
Grading five sequences produced five full score/critique blocks stacked on
one screen — exactly Greg's description, and confirmed by reading the
component rather than assumed.

**Fix:**
- `ReviewBody` is now a native `<details>`/`<summary>` element. The score,
  band and review date are always visible in the `<summary>` (glanceable even
  collapsed); the findings/critique are the collapsible body. No JavaScript
  is needed — this is plain HTML, so the component stays a server component.
- New pure module `src/lib/ai/campaign-review-display-order.ts`:
  `orderSequencesByReviewRecency` sorts reviewed sequences to the top, most
  recently reviewed first, with never-reviewed sequences kept afterward in
  their original order; `isMostRecentlyReviewed` says which single one should
  start open. The panel now opens only the most-recently-graded sequence by
  default and collapses the rest — "the one just graded" is now the first
  thing on the screen, not buried.
- Tests: `src/lib/ai/campaign-review-display-order.test.ts` (5 cases,
  red-first — reverted the sort to a no-op and watched both ordering
  assertions fail before restoring it).

## Finding 2 — templates are cluttered, structure invisible

**Confirmed, and fixed.**

The Templates screen (`src/app/(app)/clients/[clientId]/templates/page.tsx`
via `client-email-templates-panel.tsx`) groups every template by CATEGORY
(`INTRODUCTION`, `FOLLOW_UP_1`, …) — every sequence's Introduction template
lands in one shared "Introduction email" bucket. `ClientEmailTemplate` has no
`sequenceId` column at all; the only link to a sequence is via
`ClientEmailSequenceStep` (`sequenceId`, `templateId`, `position`), which the
Templates screen never joined. Row 130 (hide-archived + delete) did not touch
this — confirmed by reading its diff, which only added a status filter and a
delete action. So a client with two active sequences shows both sequences'
intros in the same box with nothing to say which intro pairs with which
follow-up, exactly as reported.

**Fix:**
- New query `loadClientSequenceTemplateStructures` in
  `src/server/email-sequences/queries.ts` — a small, purpose-built join
  (NOT a reuse of the heavier `loadClientEmailSequencesOverview`, which also
  loads contact-list members and enrollment previews the Templates page has
  no use for): one row per sequence, its steps in `position` order, each
  naming its template.
- New component `SequenceTemplateStructurePanel`
  (`src/components/clients/email-templates/sequence-template-structure-panel.tsx`)
  renders one card per sequence, its templates left-to-right in send order
  (Introduction → Follow-up 1 → …), on the Templates page above the existing
  category-grouped list. Additive only — the category list is unchanged, so
  "what templates exist" and "which sequence they belong to" are both
  answered without removing anything.
- Tests: `src/server/email-sequences/sequence-template-structure.test.ts`
  (4 cases, mocked Prisma, matching this codebase's existing pattern in
  `email-templates/queries.test.ts`) — including the specific case this row
  fixes: two sequences each with their own INTRODUCTION template must stay
  attached to their own sequence, not merge into one bucket. Red-first:
  reverted the mapping to return `steps: []` and watched the ordering/pairing
  assertions fail before restoring it.

## Finding 3 — the bounce rate shows nothing

**Measured before touching anything, per the row's explicit instruction.
Verdict: the pipeline is NOT broken. The one real gap is a missing label for
the zero-sends case, and that is what was fixed — nothing about bounce
detection or counting was touched.**

### The measurement

Ran the existing, already-proven production probe
(`scripts/ops-bounce-path-audit.ts`, via `.github/workflows/bounce-path-audit.yml`,
dispatched fresh this cycle — run
[33396050153](https://github.com/gregvisser/ODoutreach/actions/runs/33396050153)):

> Sent since the fix merged (2026-08-27): 2. Sent ever: 1,363.
> A. OutboundEmail rows with status=BOUNCED or a non-null bouncedAt: **11**,
> all via the mailbox NDR channel, all with `updatedAt` after the fix merged
> (proof this code, not a stale row, wrote them).
> Verdict: OBSERVED — at least one real bounce has been recorded by a live
> channel since the fix merged.

That answers "is the detection pipeline firing" — yes, proven, not assumed.
It does not yet answer what the SCREEN shows, so a second, temporary,
read-only diagnostic (`scripts/tmp-bounce-display-check.ts`, deleted after
use, never merged — see below) computed the exact value
`formatRate`/`MetricRow` would render for every client in production:

| Client | sent | bounces | bounceRate shown |
|---|---|---|---|
| Quirk Solutions Limited | 23 | 8 | **34.8%** |
| Morson FM | 10 | 3 | **30%** |
| Idverde | 24 | 0 | 0% |
| GreenTheUK | 332 | 0 | 0% |
| Train Hugger | 763 | 0 | 0% |
| OpensDoors | 82 | 0 | 0% |
| BidlowAI | 5 | 0 | 0% |
| (7 more clients, all sent > 0) | — | 0 | 0% |
| Protech Roofing, Shield Pest Control, Quirk Solutions, Panda Recycling, Advantos HVAC Group, Pareto FM, Recycling Lives Services | 0 | 0 | **—** |

`INTERNAL_SEED_ALLOWLIST_ENABLED=false` in production — the seed-exclusion
path in `outreach-metrics.ts` is completely inert, so it is not masking
anything. The 11 real bounces belong to two real clients and both show a real,
correct, non-zero percentage.

### The verdict

Two clients with real bounces show the real rate. Every client with sends and
zero bounces already shows a real `0%` — not blank, not broken, informative.
The one case that reads as "shows nothing" is a client with **zero sends**:
`formatRate(null)` returns a bare `—` with no explanation, indistinguishable
from a broken metric. Seven of eighteen clients in production are in exactly
that state today. This is a labelling gap, not a data defect — the
alternative the row asked me to rule in or out.

### The fix

`formatBounceRate(bounceRate, sent)` in `src/lib/reports/outreach-metrics.ts`:
returns `"No emails sent yet"` when `sent === 0`, otherwise the real
`formatRate` percentage (so a genuine `0%` is untouched). Wired into:
- `src/app/(app)/clients/[clientId]/activity/page.tsx` — the "Bounce rate"
  `MetricRow`.
- `src/app/(app)/reporting/page.tsx` — the "Bounces" tile's rate sub-line.

Tests: `formatBounceRate` cases in
`src/lib/reports/outreach-metrics.test.ts` (3 cases) — red-first: removed the
`sent === 0` branch and watched the "no sends yet" assertion fail before
restoring it.

### On the temporary diagnostic

`scripts/tmp-bounce-display-check.ts` and a matching redirect of
`.github/workflows/bounce-path-audit.yml` were committed to this row's
branch, run once via `workflow_dispatch` against production
(read-only — no write, no send, no delete), and then removed; the workflow
file was reverted to its original content before this PR. Nothing from that
diagnostic ships. The client-by-client table above is its output, preserved
here as the evidence.

## Gates

- `npm run lint` — 0 problems.
- `npm run typecheck` — 0 errors.
- `npm test` — 369 files / 3827 tests green (two Sentry-config tests
  (`src/instrumentation.test.ts`,
  `src/lib/monitoring/sentry-config-wiring.test.ts`) timed out once under
  full-suite parallel load and passed cleanly in isolation and on a full
  re-run — pre-existing flake unrelated to this change).

## What was NOT touched

No `.bidlow/GRADES.json`, no dimension, no sell gate. No edit to
`docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md` or
`docs/ops/DIMENSION-1-RESCORE-2026-08-30-cycle165.md`. No email sent, no
client data changed or deleted, no migration. All three fixes are additive
UI/query changes; nothing about bounce detection, sequence grading, or
template storage was modified.
