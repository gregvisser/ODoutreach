# Fixing row 111's confusion findings, highest damage first (row 112, cycle 140)

Row 111 (cycle 139) measured seven ranked confusion findings in
`docs/ops/2026-08-30-screen-walk-findings-row111.md` and fixed nothing. This
row fixes them, in the artefact's own ranked order. **All seven were fixed.**
No guard was weakened — every change here is to what the operator is TOLD,
never to what a send or delete is ALLOWED to do. No score was touched:
`.bidlow/GRADES.json` was not written, no dimension, no sell gate. No email
was sent; the `bidlowai` sequence stays at Ready: 1, Sent: 0, untouched.

## 1. The launch banner always said "queued", even once the email had actually gone out — FIXED

**Files changed:** `src/lib/clients/outreach-sequence-send-staff-copy.ts`,
`src/app/(app)/clients/[clientId]/outreach/sequence-actions.ts`.

The dispatcher (`sendSequenceIntroductionBatch` / `sendSequenceStepBatch`)
awaits `triggerOutboundQueueDrain()` before returning, so in production the
`OutboundEmail` rows it just queued have very often already reached a
terminal status by the time the action built its flash message — but the
message always said "N queued" from a fixed intake count, never checking
what actually happened.

**Red-first:** `src/app/(app)/clients/[clientId]/outreach/sequence-actions.test.ts`
— "says 'sent', not 'queued', once the dispatched row has actually gone
out" — watched fail against the unmodified code (`AssertionError: expected
'/clients/cl_1/outreach?sequence=1+int…' to contain 'sequence=1
introduction sent'`), because the action never re-checked anything and
always emitted the word "queued". Also
`src/lib/clients/outreach-sequence-send-staff-copy.test.ts` — 11 new tests
for `classifySequenceDispatchOutcome` / `describeSequenceDispatchOutcome`,
watched fail with `TypeError: ... is not a function` since neither existed.

**The fix:** a new, single, reused humanizer
(`describeSequenceDispatchOutcome`, following the `describeCompositionBlocker`
precedent) plus a small classifier (`classifySequenceDispatchOutcome`). Both
`sendClientEmailSequenceIntroductionAction` and
`sendClientEmailSequenceStepAction` now re-read the real status of every
`OutboundEmail` row they just created (one extra, read-only `findMany`) and
report the true outcome.

**New on-screen wording, quoted in full:**
- All sent by render time: `1 introduction sent`
- Not sent yet: `1 introduction queued — sending shortly`
- Sent + failed together: `2 introductions sent · 1 introduction queued — sending shortly · 1 introduction failed to send (see timeline for the reason)`
- Nothing queued at all (unchanged from before): `0 introductions queued`

## 2. The Do-not-contact tab said sync "isn't set up yet" directly above two cards saying it is working — FIXED

**Files changed:** `src/lib/suppression/staff-labels.ts`,
`src/components/clients/client-suppression-inline-card.tsx`.

The amber banner was gated on one GLOBAL credential
(`googleServiceAccountConfigured`), while "Sheet connected." / "Last sync
succeeded" reflect a PER-CLIENT fact that survives the global credential
being removed or rotated. Same screen, two different yes/no answers.

**Red-first:** `src/lib/suppression/staff-labels.test.ts` — 3 new tests for
`suppressionSyncUnavailableCopy`, watched fail with `TypeError:
suppressionSyncUnavailableCopy is not a function`.

**The fix:** `suppressionSyncUnavailableCopy(hasPriorSuccessfulSync)` picks
the true sentence for this client.

**New on-screen wording, quoted in full** (shown when a client has at least
one source with `syncStatus === "SUCCESS"` but the global credential is
currently missing):
> **Sync is currently unavailable**
> The list below is frozen as of its last successful sync — an
> administrator needs to reconnect Google Sheets sync before new changes in
> the Sheet come through. Manual blocks above still work.

The genuinely-never-configured case is unchanged: "Google Sheets sync isn't
set up yet".

## 3. Overview said Do-not-contact was "Not configured" while the client's own tab showed it actively blocking hundreds of addresses — FIXED (the provable half; the rest is left, named below)

**Files changed:** `src/lib/suppression/staff-labels.ts`,
`src/components/clients/client-suppression-inline-card.tsx`.

Traced cause: the Overview's count already used the test `!!spreadsheetId
?.trim()` (`client-workspace-bundle.ts:285`); the Do-not-contact tab's own
"Sheet connected." badge used a *different* test — a source row existing at
all, with no `spreadsheetId` requirement. Two tests over the same fact can
legitimately disagree.

**Red-first:** `src/lib/suppression/staff-labels.test.ts` — 4 new tests for
`suppressionSourceIsConnected`, watched fail with `TypeError:
suppressionSourceIsConnected is not a function`.

**The fix:** `suppressionSourceIsConnected(source)` is now the ONE test,
reused by the Do-not-contact tab's badge (the Overview panel already used
this exact predicate, so only the tab needed to change).

**New on-screen wording, quoted in full** (a source row exists but its
`spreadsheetId` is blank): `Sheet reference missing — paste the Sheet URL
again to reconnect.` (previously said "Sheet connected.", which is what the
Overview panel would have disagreed with).

**What is deliberately left, and why:** the artefact's fuller suggestion —
have Overview say "sheet reference missing — using the last list synced
before it went missing" instead of a flat "Not configured" — needs a new
signal (does this client have entries/sync history despite a missing
`spreadsheetId`?) threaded from `client-workspace-bundle.ts` through
`LaunchReadinessPanelInput` into `client-launch-state.ts`. That is new data
plumbing, not a wording change, and this cycle's fix already makes the two
screens use the same test — the disagreement itself cannot happen anymore.
The richer Overview copy is real but separate follow-up work.

## 4. Overview's "Lists" figure is a contact count, not a list count — FIXED (metric wording; label deliberately kept)

**File changed:** `src/lib/client-launch-state.ts`.

Confirmed the artefact's cause: the row's number is `contactsTotal` /
`contactsEligible`, not a count of lists.

**Departure from the artefact's literal suggestion, and why:** the artefact
suggested relabelling the row "Contacts". `src/lib/client-launch-state.test.ts`
("one name per destination") already enforces, on purpose since PR #138,
that this row's label matches the subnav tab it links to — which is itself
named "Lists" (`client-workspace-subnav.tsx`). Renaming the row back to
"Contacts" would reintroduce the exact two-names-per-destination defect that
PR #138 fixed and would still be tested as a regression by the very test
suite that would need editing to allow it. So the label stays "Lists"; the
**metric text** now names what it counts instead.

**Red-first:** `src/lib/client-launch-state.test.ts` — 2 new tests, watched
fail (`expected '1 total · 1 eligible' to be '1 contact total · 1
eligible'`).

**New on-screen wording, quoted in full:** `1 contact total · 1 eligible`
(was `1 total · 1 eligible`); pluralises to `3 contacts total · 2 eligible`.

## 5. A template status called "IN REVIEW" only said "Legacy status," never whether it can be used — FIXED

**File changed:**
`src/components/clients/email-templates/client-email-templates-panel.tsx`.

**Verified before writing new copy** (not guessed): `canApproveSequence`
(`sequence-policy.ts:429`) only excludes `ARCHIVED` templates from
`unusableStepCount`; `sendSequenceStepBatch`'s dispatch-time template check
(`send-introduction.ts`) also only blocks `ARCHIVED`. A `READY_FOR_REVIEW`
("In review") template can already be picked into a sequence, approved, and
sent. The old hint never said this.

**Pure wording change, no logic — stated plainly per the row's own
instruction, no test invented that could not fail.**

**New on-screen wording, quoted in full:** `Can still be used in a
sequence — open and save to move it to Saved` (was `Legacy status — open
and save to refresh`).

## 6. "Provider: mock" on the outbound email detail screen explained nothing on that screen — FIXED

**Files added/changed:** `src/lib/email/outbound-provider-copy.ts` (new),
`src/app/(app)/activity/outbound/[id]/page.tsx`.

Confirmed cause: `row.providerName` is the raw string from
`MockEmailProvider.name` ("mock"), rendered with no explanation on this
screen — the real explanation only existed on `/training/mailboxes`.

**Red-first:** `src/lib/email/outbound-provider-copy.test.ts` — 5 new tests
for `describeOutboundProvider`, watched fail with `Cannot find module
'@/lib/email/outbound-provider-copy'`.

**The fix:** one humanizer, `describeOutboundProvider`, reused for every
provider name this screen can show.

**New on-screen wording, quoted in full:**
- `mock` / `dev_simulate` / `dev_replay` → **Internal/system email** with
  the caption *Not sent through a client mailbox — this is an internal or
  test row.*
- `resend` → **Legacy system email** with the caption *Sent through the
  legacy system mailer, not a connected client mailbox.*
- `microsoft_graph` → **Microsoft (Outlook)**, `google_gmail` → **Google
  (Gmail)** — no caption, these are real client sends.

## 7. The same unexplained "mock" label appeared on the cross-client Operations screen — FIXED

**File changed:** `src/components/ops/sender-readiness-panel.tsx`.

**Verified the fix is accurate for this specific table before writing it:**
the "Sender readiness by workspace" table
(`src/app/(app)/operations/outbound/page.tsx:148`) always calls
`describeSenderReadiness` with real per-workspace mailbox data, so the
`mock_dev` headline reaching this table is always the "no send-eligible
connected mailbox in this workspace yet" case, never the data-absent
`unassessed` case that the same headline can also mean elsewhere. Saying
"no mailbox connected" here is true, not a guess.

**Pure wording change on an existing badge — no new logic, no test
invented that could not fail; the `title` tooltip explanation is kept
as-is.**

**New on-screen wording, quoted in full:** `No mailbox connected — cannot
send real outreach` (was `Legacy transport: mock`).

## Gates run for this row

- `npm run lint` — 0 problems.
- `npm run typecheck` — 0 errors.
- `npm test` — 354 files, 3736 tests, all green (up from 3723 before this
  row's new tests).
- Guard tests re-run and confirmed green and untouched:
  `send-introduction.test.ts`, `send-introduction.pacing.test.ts`,
  `suppression-guard.test.ts` — no governance, suppression, or capacity code
  was changed by this row.
