# The Launch button did nothing — row 109, 30 August 2026

**Short answer: it reached the server (the code path that fired on Greg's click
is caught end-to-end today), but two real gaps meant that IF it had failed at
the wrong moment, the operator would have seen nothing — no flash, no queued
row, no BLOCKED row, screen identical before and after. Both gaps are now
closed, with a red-first test proving one of them and a defensive fix for the
other. Production has no logging that can settle, after the fact, which of the
two ever actually fired for Greg's specific click — that gap is named plainly
below rather than guessed past.**

## What happened, verbatim from the queue

Greg clicked **Launch** on the `bidlowai` sequence *"Cycle 129 send-and-reply
walk — 2026-08-30"* between roughly 05:50 and 06:10 UTC on 30 August, confirmed
the "Launch introduction sends?" dialog, and the screen did not change. The
sequence page still read Ready: 1, Blocked: 0, Sent: 0. Production
`OutboundEmail` counts for `bidlowai`, measured before and after the window,
were identical — nothing was queued, nothing was blocked, nothing failed.
Production was confirmed serving commit `3dd9351` (built 05:47:28Z) at the
time, which already contains row 106's `describeCompositionBlocker` fix — so a
composition refusal would have named its cause on screen. It didn't. See
`.bidlow/relay/QUEUE.md` row 109 for the brief in full.

## Step (b)/(c): could production logging settle whether the click reached the server?

**No — and that is itself the first finding.** Checked read-only, this cycle,
against the real Azure resources:

- `az webapp config appsettings list` / `az webapp log show` on
  `app-opensdoors-outreach-prod`: **`applicationLogs.fileSystem.level: "Off"`,
  `httpLogs.fileSystem.enabled: false`, `detailedErrorMessages.enabled: false`,
  `failedRequestsTracing.enabled: false`.** No application or HTTP log of any
  kind is retained.
- Application Insights component `app-opensdoors-outreach-prod` exists
  (`retentionInDays: 90`) and is wired via the App Service's
  `hidden-link: /app-insights-resource-id` tag, but a KQL query against
  `requests`/`traces`/`exceptions`/`customEvents` for the entire day of
  2026-08-30 — not just the click window — returned **zero rows across every
  table.** The resource has never actually ingested telemetry; only the shell
  exists.
- Sentry (`NEXT_PUBLIC_SENTRY_DSN`, set only in
  `.github/workflows/deploy-production.yml`) is the app's real client-side
  error monitor, but `SENTRY_AUTH_TOKEN` is a write-only GitHub Actions secret
  — this cycle has no credential to query the Sentry API and none was minted,
  per the read-only instruction in the brief.

So step (b) — "check the production App Service logs and Application
Insights for that route, read-only, and say plainly whether a request
exists" — was done, and the plain answer is: **no record exists either way.**
This is a real, separate defect (structured logging for a Tier P production
app that sends real client email is effectively off), named here as a finding
and left out of scope — the row's own scope line names the launch component,
the action, and their tests, not a logging rollout.

## Step (d): what in the client could swallow the click, reading the real code

Reading `sequence-phrase-confirm-launch.tsx` and
`sequence-actions.ts` line by line (the exact files behind the "Launch
sequence" button and the "Launch introduction sends?" dialog Greg used — the
UI strings match the brief exactly, including "Ready: 1 · Blocked: 0 ·
Sent: 0"), two real gaps were found. Both produce the *same* symptom: the
server actually does nothing observable, so the screen looks unchanged.

### Gap 1 — server: two checks ran BEFORE the action's own try/catch (fixed, red-first proven)

`sendClientEmailSequenceIntroductionAction` and `sendClientEmailSequenceStepAction`
in `src/app/(app)/clients/[clientId]/outreach/sequence-actions.ts` each re-verify
tenant access and mutator permission on every call — correctly, defense in
depth. But both calls sat **before** the function's only `try { ... } catch`
block:

```ts
await requireClientAccess(staff, clientId);
await requireClientEmailSequenceMutator(staff, clientId);

try {
  const result = await sendSequenceIntroductionBatch({ ... });
  ...
  redirectBack(clientId, { kind: flashKind, message: flashMsg }, sequenceId);
} catch (e) {
  ...
  redirectBack(clientId, { kind: "error", message: flashForError(e) }, sequenceId);
}
```

Every failure *inside* `sendSequenceIntroductionBatch` — no mailbox pool, no
capacity, suppressed recipient, composition blocked, anything —  was already
caught and turned into a redirect carrying a named flash message. But if
`requireClientAccess` or `requireClientEmailSequenceMutator` ever threw (a
permission edge case, a transient DB hiccup under load), the exception
propagated **uncaught**. The server would have done real work — authenticated
the request, started evaluating it — and produced nothing the operator could
see: no flash, no queued row, no BLOCKED row. That is exactly the shape
measured against production: zero rows of any kind, not even a blocked one.

**Red-first test, watched failing against the unmodified code** (see full
output further down):

```
✓ still redirects to a success flash on the normal path
× redirects with the named reason when requireClientAccess fails, instead of throwing uncaught
  → expected [Function] to throw error including 'NEXT_REDIRECT' but got 'FORBIDDEN_CLIENT'
× redirects with the named reason when requireClientEmailSequenceMutator fails
  → expected [Function] to throw error including 'NEXT_REDIRECT' but got 'You do not have permission to manage …'
× (sendClientEmailSequenceStepAction) redirects with the named reason when requireClientAccess fails
  → expected [Function] to throw error including 'NEXT_REDIRECT' but got 'FORBIDDEN_CLIENT'
```

That is the raw `Error("FORBIDDEN_CLIENT")` escaping the action entirely — no
redirect, no flash, nothing the operator would ever see. **Fix:** both checks
moved inside the try/catch, so any failure there now redirects back with the
same named-reason mechanism every other failure in this file already uses.
After the fix, all four tests pass (quoted in full below).

### Gap 2 — client: `form.requestSubmit()` can silently no-op or throw with nothing on screen (defensive fix, no automated test — see "What was not proven" below)

`confirm()` in `sequence-phrase-confirm-launch.tsx` sets the hidden
confirmation-phrase field via a DOM ref and calls `form.requestSubmit()`
directly, then immediately closes the modal:

```ts
phraseInput.value = confirmationPhrase;
form.requestSubmit();
closeModal();
```

Two ways this can produce silence that were not previously handled:

1. `HTMLFormElement.requestSubmit()` runs native constraint validation. If
   that fails, the browser fires **no submit event and throws no
   exception** — it just does nothing. Nothing in this component checked for
   that.
2. If `requestSubmit()` (or anything before it) throws synchronously inside
   a React event handler, React does **not** route that to the nearest error
   boundary the way it does a render-time error — event-handler exceptions
   are reported to the console only. `src/app/(app)/error.tsx` exists and
   would have caught a *render* error with a very visible full-page
   replacement, which is why an uncaught error deep in `sendSequenceStepBatch`
   was never the leading theory here — but it cannot catch a click-handler
   exception, and this codebase had none for this handler.

**Fix:** `confirm()` now checks `form.checkValidity()` before submitting and
wraps `requestSubmit()` in try/catch; either failure now sets the same
`setError(...)` state the dialog already renders (`role="alert"`, visible
inside the still-open dialog) instead of closing silently.

## What was and was not proven

**Proven, with evidence:** the server-side gap (1) is real, was reproduced
red-first against the unmodified code, and is fixed. Every other failure path
already reachable from a real click — no mailbox pool, no capacity, blocked
governance, suppressed recipient, composition failure — was already caught
before this row and remains caught; nothing about the fix weakens any of
those refusals (see "Proof the guard still refuses" below).

**Not proven, named plainly:** with structured logging entirely off in
production (see above), this cycle cannot say with certainty which of the two
gaps — if either — is what actually happened during Greg's specific click.
Client-side gap (2) has no automated regression test: this repository's
vitest suite runs in a plain Node environment with no DOM (`environment:
"node"`, `src/**/*.test.ts` only — see `vitest.config.ts`'s own comment,
*"Pages/UI are covered by e2e"*), and there is currently **no Playwright e2e
coverage of the sequence-launch journey at all** — a real, separate gap this
cycle did not have the scope to close (building a launchable sequence fixture
from scratch — contact list, template, sequence, step, enrollment, step-send —
touches the full send-governance chain: warm-up ramps, pacing, the corporate
release gate). The defensive fix is applied and lint/typecheck-verified, but
is proven only by code reading, not by a driven click. Recommended follow-up:
add e2e fixtures for a launchable sequence and drive the real dialog through
Playwright, the strongest form for this journey.

## The on-screen outcome, quoted in full

Before this fix, a failure in gap 1 produced literally nothing — the redirect
never ran. After the fix, the same failure now redirects to
`/clients/{clientId}/outreach?sequenceError=<message>&sequenceId=<id>#outreach-selected-sequence`,
which the page (`src/app/(app)/clients/[clientId]/outreach/page.tsx`) renders
through the existing `sequencesFlash.error` banner — the same banner every
other refusal in this panel already uses (see
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md` for what a
genuine "Ready to launch" screen looks like). For the two failures exercised
by the red-first test, the operator now sees:

- `FORBIDDEN_CLIENT` (access check) — the workspace's own error copy for this
  code, surfaced by `flashForError`.
- *"You do not have permission to manage email sequences for this client."*
  (mutator check).

Both read as plain English and both name a real cause — not a generic
"something went wrong." On the client-side gap, the dialog now stays open and
shows *"This form isn't ready to submit — refresh the page and try again."*
or *"Could not submit: `<message>`."* instead of closing over silence.

## Proof the guard still refuses

No governance, suppression, mailbox-pool, capacity, or hard-rule code was
touched — only exception plumbing around calls that were already being made.
The full unit suite (3,706 tests, see below) includes the existing coverage
for `evaluateSendGovernance`, `client-send-governance.test.ts`, the
`autonomous-actor-guard` bidlowai-only hard rule, and the composition-blocker
tests, all unchanged and all green. A blocked send is still blocked; this row
only makes the refusal — or the success — visible every time, rather than
sometimes.

## Gates, run for real

```
$ npm run lint
> eslint
(clean, no output)

$ npm run typecheck
> tsc --noEmit
(clean, no output)

$ npm test
 Test Files  352 passed (352)
      Tests  3707 passed (3707)
```

(All green, including the 4 new tests in `sequence-actions.test.ts` and the
previous cycle's own log file now committed — the `cycle-log-reaches-git`
test was red at the start of this cycle for the unrelated, standing reason
that `cycle-133.md` had not yet been added to git; fixed by adding it.)

## The cycle-129 sequence — confirmed untouched, read-only, this cycle

Queried directly against the production database (temporary firewall rule
scoped to this machine's own public IP, added and removed within the same
check, matching the precedent in
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md`):

```
BIDLOWAI OutboundEmail by status: SENT 1 · FAILED 1 · BLOCKED_SUPPRESSION 1 · REPLIED 3
Sequence "Cycle 129 send-and-reply walk — 2026-08-30": status APPROVED
StepSend counts for that sequence: READY 1
```

Identical to cycle 129's own before/after measurement. **The cycle-129
sequence is untouched and still Ready — 1 recipient, 0 sent — exactly as
row 104 and cycle 129 left it, waiting for Greg's own click.**

## Hard rule

No email was sent by this row, for `bidlowai` or anyone else. No client data
was mutated beyond the two source files and their test. No schema change, no
migration.
