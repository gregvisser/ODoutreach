# Cycle 16 — queue item 29 — plan of record

Written before any code was changed.

## 1. The files I am going to change

**(a) The correctness bug — the readiness rail says Ready with zero sequences.**

| File | Change |
|---|---|
| `src/lib/client-launch-state.ts` | Add `enrolledContactsCount` to the snapshot input. Add one exported predicate `isOutreachModuleReady()`. Use it in the Outreach readiness row, the Outreach workflow pill, and `deriveLaunchStageLabel`. |
| `src/lib/clients/getting-started-view-model.ts` | The 8th item ("Check launch readiness") must use the same predicate instead of `outreachPilotRunnable` alone. |
| `src/app/(app)/clients/[clientId]/page.tsx` | Pass the already-loaded `enrolledContactsCount` into the snapshot. |
| `src/server/clients/launch-approval.ts` | Same — pass the already-loaded `enrolledContactsCount` into the snapshot. |
| `src/lib/client-launch-state.test.ts` | Red-first tests + correct two existing tests that currently enshrine the bug. |
| `src/lib/clients/getting-started-view-model.test.ts` | Red-first test for the 8th item. |

### Root cause, stated plainly

`outreachPilotRunnable` is **a mailbox fact, not an outreach fact**. It is
`hasGovernedMailbox && oauthReadyForGovernedTest && poolCanSendPilot`
(`page.tsx:88`) — it asks "could a governed mailbox send something today?" and
nothing else. Nothing in it looks at sequences, steps or enrolments.

That single boolean is then used as the Outreach module's readiness in four
places, which is why one screen contradicts itself:

* `client-launch-state.ts:212` → readiness row pill `ready`, "Ready to launch"
* `client-launch-state.ts:385` → workflow pill "6 Outreach — complete"
* `client-launch-state.ts:273` → header badge "Ready to launch"
* `getting-started-view-model.ts:133` → checklist item 8 done

Meanwhile the *gate that actually matters* — `evaluateClientLaunchApproval`
(`client-launch-approval.ts:138-145`) — already blocks correctly on
`hasProductionLaunchableSequence` and `enrolledContactsCount < 1`. So the rail
and the gate have been reporting different answers about the same client. The
fix makes the rail use the gate's predicate. **Display and gate become the same
boolean, so they cannot drift again.**

`hasProductionLaunchableSequence` is already computed on both call sites and
already requires an introduction step (`launch-readiness.ts` check 4) plus
recipients ready to send (check 8). `enrolledContactsCount` is already computed
on both call sites too. Neither is a new query — both are loaded and then
thrown away before reaching the rail.

## 2. The red-first test

* `src/lib/client-launch-state.test.ts` → new block
  `"a workspace with no sequence is never reported ready"`, asserting that with
  `outreachPilotRunnable: true` but `hasProductionLaunchableSequence: false`:
  the outreach row pill is NOT `ready`, the outreach workflow step is NOT
  `complete`, and `deriveLaunchStageLabel` is NOT `"Ready to launch"`. Plus a
  second case: launchable sequence but `enrolledContactsCount: 0` is also not
  ready.
* `src/lib/clients/getting-started-view-model.test.ts` → asserts item 8
  (`launch`) is not done when items 6/7 are not done — i.e. the checklist can
  never again say "5 / 8" while the rail says Ready.

These CAN go red first: today's code returns `ready` for exactly these inputs.
Two existing tests (`client-launch-state.test.ts:218` and `:230`) currently
assert the buggy copy verbatim and are corrected as part of the fix — that is
the strongest possible evidence the behaviour really changed.

## 3. What "done" looks like, for a non-coder

> Open a client that has no sequence built. The page no longer says "Ready to
> launch" anywhere. It tells you the sequence is missing, and it says the same
> thing in all four places on the screen instead of arguing with itself.

## 4. What I must NOT touch

Anything outside the six files above. Specifically **not**:
`launch-readiness.ts` (the sequence rail is correct), `client-launch-approval.ts`
(the gate is already correct), `auto-promote-client.ts`, any send path,
`execute-one.ts`, suppression, or any schema/migration. **No migration is
needed for this item.**

## Part (b) — build BidlowAI a staged sequence

Investigated separately; see `CYCLE-16-LOG.md` for the finding and decision.
No email is sent by this cycle under any circumstance.
