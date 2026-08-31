# Row 149 — the app-shell "how do I...?" search bar

2026-08-31, cycle 209.

Greg asked directly on 31 August for an AI search bar over the system, for
staff questions of the form "how do I do this, how do I do that." He asked for
a recommendation on placement, and it was given by an earlier cycle: the app
shell top bar, reachable from every screen, not inside the Training tab. This
row carries that placement decision through to a built feature. It replaces
the narrower training-only ask-box originally raised by row 134 finding 5.

**Blocked behind row 148, honoured.** Row 148 (all fourteen training-content
drift defects) merged first, at `66bec14` — confirmed by reading
`.bidlow/relay/QUEUE.md` and the git log before starting any of this row's
work. An answer engine over wrong content would have produced confidently
wrong answers, which the brief correctly called worse than no search bar.

## What was built

**Scope of what it may read — the whole compliance answer.** The search bar
answers ONLY from the nine modules in `src/lib/training/modules.ts`,
`STAFF_VIDEO_SCRIPTS`, `STAFF_HANDOVER_CHECKLIST`, and
`src/lib/training/staff-handover-guide.ts`. Nothing else — no client data, no
prospect data, no reply text, no database read beyond resolving the billing
client and writing the unanswered-question log.

- `src/lib/training/assistant-content.ts` — builds ~90 retrievable, citable
  chunks (module purpose, module steps, common mistakes, handover checklist
  rows, handover guide sections, video scripts) purely from the four static
  training exports. No import path to `@/lib/db`'s client/prospect/reply
  tables, which is what makes `carriesPersonalData: false` structurally true
  rather than merely declared.
- `src/lib/training/assistant-search.ts` — dependency-free lexical
  word-overlap search over those chunks. A question must clear 50% overlap of
  its own meaningful words against a chunk before that chunk is considered "in
  scope." An empty result means the model is never called at all — the
  structural half of "must not guess."
- `src/lib/ai/training-assistant-prompt.ts` — the forced tool call
  (`record_training_assistant_answer`: `canAnswer`, `answer`, `citedChunkIds`)
  and the system prompt instructing the model to say "I don't know" rather
  than infer beyond the supplied passages.
- `src/server/ai/answer-training-question.ts` — orchestration. Runs the
  lexical search first (no match → logged, no model call, nothing billed);
  resolves the `bidlowai` client to bill (never the client a staff member
  happens to be viewing — this is an internal ops tool); calls
  `runMeteredAiCall` with the new `TRAINING_ASSISTANT` feature; and — the key
  guard — re-validates every `citedChunkIds` entry against the chunks actually
  retrieved for that question before trusting a `canAnswer: true`. A citation
  the model invented, or a `canAnswer: true` with zero valid citations, is
  treated as `MODEL_UNSURE`, not shown to the staff member.
- `src/app/(app)/training/assistant-actions.ts` — the two server actions the
  UI calls: `askTrainingAssistantAction` (staff-gated) and
  `raiseTrainingAssistantTicketAction`, which reuses the existing
  `createSupportTicket` (`src/app/(app)/support/actions.ts`) rather than
  writing a ticket table directly, and links the created ticket back to the
  unanswered-question row.
- `src/components/training/training-assistant-search.tsx` — the UI. A button
  in the app-shell top bar (`⌘K` / `Ctrl K` opens it from anywhere), backed by
  the existing `Sheet` primitive. Renders an answer with clickable source
  links, or the honest "I don't have that in the training material — shall I
  raise a ticket?" path with a one-click ticket button.
- `src/components/app-shell/app-header.tsx` — wired the search bar in. `app-header.tsx`
  renders inside `src/app/(app)/layout.tsx`, which wraps every authenticated
  route, so the search bar is reachable from every screen without exception —
  proven by the fact that no page-specific wiring was needed at all.
- **Schema** (additive only — see the migration's own header comment for the
  transaction-safety note on `ALTER TYPE ... ADD VALUE`): one new `AiFeature`
  enum value (`TRAINING_ASSISTANT`), one new enum
  (`TrainingAssistantUnansweredReason`: `NO_MATCHING_CONTENT`, `MODEL_UNSURE`,
  `AI_CALL_REFUSED`, `AI_CALL_ERROR`), and one new table
  (`TrainingAssistantUnansweredQuestion` — never joined to a client, prospect
  or reply, because this feature never reads any). Migration
  `20260831180000_training_assistant`.
- `src/lib/ai/model-catalog.ts` + `src/server/ai/ai-feature-data-policy.ts` —
  `TRAINING_ASSISTANT` priced on the same Haiku rate as every other feature
  (still flagged unverified — no second unchecked price added), and declared
  `carriesPersonalData: false` with `vendor: "ANTHROPIC"`. `COVERED_PROCESSORS`
  in `ai-feature-data-policy.ts` was NOT touched — still empty of Anthropic.

## The three behaviours the brief named

1. **Every answer cites its source.** Structurally enforced, not merely
   prompted: `answerTrainingQuestion` discards any citation id that was not
   actually among the matched chunks for that question, and a `canAnswer: true`
   answer with zero surviving citations is downgraded to "I don't know."
2. **Ticket fallback.** `raiseTrainingAssistantTicketAction` reuses
   `createSupportTicket` and pre-fills the ticket with the exact question
   asked. Proven by test: a real `SupportTicket`-creating call is made, with
   the question text present in the description.
3. **The honest backlog.** Every unanswerable question — no matching content,
   model said it could not answer, the call was refused, or the call errored
   — is written to `TrainingAssistantUnansweredQuestion` with a reason. This
   is not yet surfaced on a dedicated screen (out of this row's scope as
   written — the brief asked for it to be "recorded" and "surfaced somewhere a
   human will actually see it"; recording is done, and the table is readable
   today via any database tool or a future small admin view). Flagging this
   honestly rather than rounding up: **a dedicated UI to browse this backlog
   was not built in this row** — the data is captured and queryable, but there
   is no in-app screen for it yet. Worth a small follow-up row if Greg wants
   one.

## The four required tests — proven red without the change

All four live in `src/server/ai/answer-training-question.test.ts` (three) and
`src/app/(app)/training/assistant-actions.test.ts` (one), alongside two
supporting files (`assistant-search.test.ts`, `assistant-content.test.ts`)
that back the retrieval layer the four tests depend on.

Red-first proof: `src/server/ai/answer-training-question.ts`,
`src/lib/ai/training-assistant-prompt.ts` and
`src/app/(app)/training/assistant-actions.ts` were moved out of the tree and
`answer-training-question.test.ts` + `assistant-actions.test.ts` were run —
both failed with `Cannot find module`, confirming the tests are capable of
failing. The files were restored and the same run went green (11/11 passing).

1. **A citation resolves to a real module and step** —
   `answer-training-question.test.ts › "returns citations whose href and
   label match a real chunk actually retrieved for this question"`. Uses the
   REAL `searchTrainingContent("How do I set a branded signature?")` result
   (not a fixture) as the cited id, and asserts the returned citation's
   `href`/`label` equal `getTrainingAssistantChunk`'s real values, and that
   the href starts with `/training/`.
2. **An out-of-scope question returns the do-not-know path, not an invented
   answer** — `"returns the do-not-know path and logs NO_MATCHING_CONTENT —
   no model call, nothing billed"`. Asserts `callAnthropicMessages` is never
   called and no billing client is even resolved.
3. **The ticket fallback creates a real ticket with the question in it** —
   `assistant-actions.test.ts › "creates a REAL support ticket carrying the
   question, via the shared ticket-creation path"`. Asserts
   `createSupportTicket` (the real ticket-creation function) is called with a
   `FormData` whose description contains the verbatim question, and that the
   resulting ticket id is linked back to the unanswered-question row.
4. **The feature is refused if ever declared as carrying personal data** —
   `answer-training-question.test.ts › "the personal-data processor gate
   (CR-10)" › "refuses to answer — and never calls Anthropic — if
   TRAINING_ASSISTANT were ever declared to carry personal data"`. Mocks
   `isPersonalDataUncovered` to return `true` specifically for
   `TRAINING_ASSISTANT` (the same CR-10 gate `metered-call.ts` already
   enforces for `REPLY_CLASSIFICATION`) and asserts the call is refused before
   `callAnthropicMessages` runs, with `outcomeCode: "no_processor_allowance"`
   on the usage ledger.

## Gates, run and shown

- `npx tsc --noEmit` — 0 errors.
- `npm run lint` — 0 problems.
- `npm test` — **376 files / 3907 tests, all green** (includes the two
  pre-existing infrastructure tests that this cycle's own housekeeping had to
  satisfy: `relay/cycle-log-reaches-git.test.ts` — cycle 207/208's logs were
  untracked at the start of this cycle and are staged in this same commit —
  and `src/components/app-shell/nav-prefetch.test.ts`, which required adding
  `prefetch={false}` to both `<Link>`s in the new component).
- `npm run build` — webpack production build succeeded; every route,
  including `/training`, `/training/[moduleId]` and `/training/staff-handover`,
  built cleanly with the new anchor ids (`#step-N`, `#mistake-N`,
  `#handover-checklist-N`, `#handover-section-N`) that citation links resolve
  to.

## The hard rule

Nothing in this row sends an email or deletes data for any client. The one
new database write beyond the migration itself
(`TrainingAssistantUnansweredQuestion`) carries a staff member's own typed
question and email — never a client's, prospect's or reply's data — and the
one AI call this row adds is billed to the `bidlowai` workspace specifically
so that no other client's spend is touched by an internal ops tool.
