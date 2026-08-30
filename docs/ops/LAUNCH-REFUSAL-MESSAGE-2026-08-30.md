# Launch refusal message names the real cause — 2026-08-30 (row 106, cycle 131)

## The problem, restated

When a sequence launch batch loses send-readiness between planning and
dispatch, the operator saw one identical sentence no matter what actually went
wrong:

    Composition lost send-readiness between planning and dispatch; re-plan.

Cycles 105 and 106 both walked the real screens and both hit this exact wall.
It took a third cycle (107), reading deployed source, to find the actual
cause: a null `Client.defaultSenderEmail`. The code already computed exactly
which field was missing — `composeSequenceEmail`'s `missingFields` and
`warnings` — and discarded it in favour of the generic sentence.

## A file path in the brief was wrong

The brief named `src/server/email/outbound/send-introduction.ts`. That path
does not exist. The real file, confirmed by grepping the whole repo for the
generic string and for `composeSequenceEmail`, is
`src/server/email-sequences/send-introduction.ts`. The line numbers the brief
gave (1093–1115) were correct for that file — only the directory was wrong.
QUEUE.md row 106 should be read with that correction; not fixed here since the
row content itself is historical record, not live code.

## MEASURE FIRST — what `missingFields` and `warnings` actually contain

Read `src/lib/email-sequences/sequence-email-composition.ts` (the pure helper
`composeSequenceEmail` used by both the plan-time classifier and the
dispatch-time re-check in `send-introduction.ts`):

- `missingFields: SequencePlaceholderKey[]` — every canonical placeholder key
  (`email`, `first_name`, `last_name`, `full_name`, `company_name`, `role`,
  `website`, `phone`, `sender_name`, `sender_email`, `sender_company_name`,
  `email_signature`, `unsubscribe_link`) whose resolved value was empty at
  composition time, populated **regardless of whether the template
  referenced it** — the five in `SEQUENCE_SEND_REQUIRED_FIELDS` are checked
  unconditionally; any other key ends up here too if the template happens to
  reference it and the value is empty.
- `warnings: string[]` — human-readable but developer-facing sentences such
  as `` Missing value for: {{sender_email}}, {{unsubscribe_link}}. Populate
  sender profile and contact fields before send. `` — these **do** leak the
  raw `{{ snake_case }}` token, which is exactly the discipline the brief
  says dimension 3 was scored 9 on. They were never surfaced to an operator
  screen (only used internally / in dev tooling), and this row does not
  route them there.

### Why a row marked READY at planning time can still fail at dispatch

Traced the actual mechanism (not assumed): the plan-time classifier
(`sendSequenceStepBatch`, lines ~569–584) builds a `placeholderSenderRow` with
two defensive fallbacks so an as-yet-unresolved per-recipient value doesn't
block planning:

```ts
if (!placeholderSenderRow.senderEmail && pool.length > 0) {
  placeholderSenderRow.senderEmail = pool[0].email;
}
if (!placeholderSenderRow.unsubscribeLink) {
  placeholderSenderRow.unsubscribeLink =
    "[unsubscribe link — provided at dispatch]";
}
```

At dispatch time (inside the transaction, lines ~1036–1092) the REAL
`unsubscribeUrlForSend` is computed with no such fallback:
`fallbackUnsubscribeLink = buildUnsubscribePlaceholder(client.defaultSenderEmail)`,
which returns `""` when `defaultSenderEmail` is `null`. If the client also has
no aligned link domain (`alignedLinkBaseUrl === null`), `unsubscribeUrlForSend`
stays `""`, so `buildSenderRow(...).unsubscribeLink` is `null` — genuinely
different from the placeholder that let the row through as READY. This is the
row-99/cycle-107 incident exactly reproduced, and it is why the message says
"lost send-readiness between planning and dispatch": the plan-time and
dispatch-time sender rows really can disagree.

Note separately: the coarser, earlier governance gate
(`oneClickReady` in `send-introduction.ts` ~line 563) checks whether **any**
mailbox in the pool can receive a mailto opt-out — that's the mailbox's own
address, not `client.defaultSenderEmail`. So a client with a working mailbox
pool but no `defaultSenderEmail` clears that gate fine and reaches the
per-recipient `composeSequenceEmail` re-check, where it fails. Two different
checks, two different inputs, which is exactly how a row can be READY at plan
time and still blocked at dispatch.

## Every place the generic string is produced or surfaced

`grep -rn "Composition lost send-readiness" .` across the whole repo (excluding
generated code):

| Location | What it is |
|---|---|
| `src/server/email-sequences/send-introduction.ts:1098` | `blocked.push({ reason: ... })` — the in-memory result the caller sees |
| `src/server/email-sequences/send-introduction.ts:1106` | `tx.clientEmailSequenceStepSend.update({ blockedReason: ... })` — the value persisted to the DB and read back everywhere else |
| `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md:63` | The incident evidence — the exact operator-visible text from a real screen walk |
| `.bidlow/relay/log/cycle-107.md`, `cycle-108.md`, `.bidlow/STATE.md`, `.bidlow/GRADES.json`, `.bidlow/relay/QUEUE.md` | Historical relay records quoting the string — left untouched, they are the record of what happened, not live code |

Only **two** call sites in `src` produce the string, both in the same
`if (!composition.ok || !composition.sendReady)` block, so one fix covers
both.

### Where the persisted `blockedReason` is surfaced to an operator

Traced every consumer of `ClientEmailSequenceStepSend.blockedReason`:

1. **`disabledReason` on the Launch button** (`send-introduction.ts`
   `computeSequenceStepSendUiSnapshots`, ~line 1660): built from
   `reasonBuckets`, which groups on the **raw, unhumanized** stored string —
   `` `${count} recipient(s) blocked: ${topReason}` ``. This is the exact
   surface `SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md` quoted the incident
   from. Fixing the stored string fixes this surface directly, with no
   further change needed.
2. **The blocked-reason breakdown list** in
   `src/components/clients/email-sequences/sequence-send-preparation-panel.tsx`
   (`blockedReasonCounts.map(...)`): passes the same raw string through a
   local `humanizeBlockedReason(raw)` first. Two of its branches
   (`"no email"` / `"missing email"`, and `"unsubscribe"`) would have
   flattened the new, specific message back down to a shorter generic one
   ("Recipient has no email address" / "Missing unsubscribe link"), losing
   the screen pointer. **Fixed here**: those two branches now pass the raw
   string through unchanged when it already names its own fix (contains
   "Review recipients" or "Mailboxes tab"), so this second surface reads the
   same specific text as the first.
3. **`humanizeStepSendBlockedReason`** in
   `src/server/queries/client-contact-list-detail.ts` (a *third*,
   independent humanizer, for the per-contact status view) already has a
   `"missing required sender" / "required field"` branch returning a
   generic-but-non-leaking "Sender profile is incomplete (a required field
   is missing)." **Not touched** — out of this row's named scope
   (`send-introduction.ts`, the screen that renders the refusal, their
   tests). Left as a candidate for a follow-up row if this surface also
   needs the specific wording; it does not currently leak anything.

### A related, out-of-scope finding — flagged, not fixed here

`src/lib/email-sequences/sequence-send-policy.ts` (the **plan-time**
classifier used by "Prepare send records", a different call site from the
dispatch-time re-check this row was scoped to) has its own catch-all:

```ts
reasonDetail: `Missing required sender field(s): ${missing
  .map((k) => `{{${k}}}`)
  .join(", ")}`,
```

This **does** leak the raw `{{ snake_case }}` token onto whatever screen
displays a plan-time block for a field that isn't `unsubscribe_link` or
`email` (its two specifically-handled cases). Traced whether an operator can
actually see it: yes — this string is stored on the same
`ClientEmailSequenceStepSend.blockedReason` column and surfaces through the
same three consumers above. The generic panel humanizer's
`"missing" && "sender"` branch (line 118) returns it **unchanged**, so today
an operator blocked by this specific plan-time path sees a raw
`{{sender_company_name}}`-style token on screen right now. This is a live,
separate defect from the one this row was asked to fix (different string,
different call site), and it is outside the SCOPE line
(`send-introduction.ts`, the refusal screen, their tests, the artefact) —
recommending it as its own row rather than fixing it here, since the same
"grouped, plain-English, screen-pointing" treatment built in this row would
apply directly.

## RED-FIRST — watched failing, quoted verbatim

Two test suites were written against the (nonexistent) fix, then the
implementation was stashed out via
`git stash push --keep-index -- <impl files>` and each suite run for real
against the unmodified code.

**Pure-function level** (`src/lib/email-sequences/sequence-email-composition.test.ts`,
new `describeCompositionBlocker` describe block) — all 5 new tests failed
because the export didn't exist:

```
 × describeCompositionBlocker > names a missing unsubscribe rail and points at the Mailboxes tab — not the generic re-plan message
   → (0 , describeCompositionBlocker) is not a function
 × describeCompositionBlocker > names a recipient with no email and points at Review recipients
   → (0 , describeCompositionBlocker) is not a function
 × describeCompositionBlocker > groups fields that share the same fix into one sentence instead of repeating it
   → (0 , describeCompositionBlocker) is not a function
 × describeCompositionBlocker > never leaks a raw placeholder token for an unknown template placeholder
   → (0 , describeCompositionBlocker) is not a function
 × describeCompositionBlocker > keeps the generic message for the one case that has nothing to name
   → (0 , describeCompositionBlocker) is not a function

Test Files  1 failed (1)
     Tests  5 failed | 19 passed (24)
```

**Real dispatcher level** (`src/server/email-sequences/send-introduction.test.ts`,
new test `"names the missing unsubscribe rail instead of the generic re-plan
message when composition loses send-readiness at dispatch (row 106)"` —
this one drives `sendSequenceStepBatch` with a real `$transaction` callback,
the same pattern `send-introduction.pacing.test.ts` established, so the
actual dispatch code at lines 1093–1115 runs, not a mock that short-circuits
before it):

```
 × sendSequenceStepBatch — governance gate > names the missing unsubscribe rail instead
   of the generic re-plan message when composition loses send-readiness at dispatch (row 106)
   AssertionError: expected 'Composition lost send-readiness betwe…' not to be
   'Composition lost send-readiness betwe…' // Object.is equality
```

— i.e. the dispatcher, run for real, produced the exact generic sentence the
brief quotes from the incident. The implementation was then restored
(`git stash pop`) and both suites re-run green.

## The new operator-facing wording, quoted in full

For the exact scenario reproduced by the dispatch-level test (client with no
`defaultSenderEmail`, no aligned link domain, a working mailbox pool):

> No unsubscribe link could be created for this send — set the client's
> default sending email on the Mailboxes tab.

For a recipient with no email address on file:

> This recipient has no email address on file — open Review recipients to
> fix it.

For a client missing both its default sending email and (consequently) the
unsubscribe link, both problems collapse into one sentence rather than
repeating the same screen pointer twice:

> This client has no default sending email address set and no unsubscribe
> link could be created for this send — set the client's default sending
> email on the Mailboxes tab.

For a template referencing a placeholder ODoutreach doesn't recognize:

> The template uses a placeholder ODoutreach doesn't recognize — fix it on
> the Templates tab before sending.

None of these mention a database field, a table, an id, or a `{{ }}` token —
verified by explicit `not.toContain("{{")` assertions in both new test
files, and by eye above.

## Proof the guard still refuses

The dispatch-level test asserts, in the same run that checks the new
wording, that the row is still written as `status: "BLOCKED"` and that
`prisma.$transaction` never reaches a send — nothing in
`composeSequenceEmail`'s `ok`/`sendReady` gate, or the
`if (!composition.ok || !composition.sendReady)` branch that blocks on it,
was touched. Only the string assigned to `reason` / `blockedReason` inside
that already-existing branch changed. Confirmed by reading the diff: the
`if` condition itself is byte-for-byte unchanged.

## Gates

```
$ npm run lint        → 0 problems
$ npm run typecheck   → 0 errors
$ npm test             → 3667 tests, 3666 passed, 1 unrelated pre-existing
                          failure (relay/cycle-log-reaches-git.test.ts,
                          fixed by committing the previous cycle's untracked
                          log alongside this change — not a code defect)
```

## Files changed

- `src/lib/email-sequences/sequence-email-composition.ts` — new
  `describeCompositionBlocker` export + `MISSING_FIELD_EXPLANATIONS` map.
  Pure, no I/O, consistent with the module's existing hard rules.
- `src/lib/email-sequences/sequence-email-composition.test.ts` — 5 new
  tests for `describeCompositionBlocker`.
- `src/server/email-sequences/send-introduction.ts` — both call sites at
  the composeSequenceEmail dispatch-time re-check now use
  `describeCompositionBlocker(composition)` instead of the generic string.
- `src/server/email-sequences/send-introduction.test.ts` — 1 new
  dispatch-level test reproducing the row-99/cycle-107 incident for real.
- `src/components/clients/email-sequences/sequence-send-preparation-panel.tsx`
  — `humanizeBlockedReason`'s "no email" / "unsubscribe" branches now pass a
  reason through unchanged when it already names its own fix, instead of
  flattening it back to a shorter generic sentence.

## Not done, and why

- `sequence-send-policy.ts`'s raw `{{key}}` leak (see "A related,
  out-of-scope finding" above) — real, but a different call site outside
  this row's named scope. Recommend as its own row.
- No score, dimension, or `.bidlow/GRADES.json` change — the brief was
  explicit that this is for a future measured walk to observe, not for this
  row to assert.
- No schema change, no migration, no send. `bidlowai`'s sequence sitting at
  Ready to launch (from cycle 129) was not touched or clicked.
