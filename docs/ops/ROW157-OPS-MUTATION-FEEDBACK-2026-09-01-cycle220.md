# Row 157 — operations/outbound mutation buttons now report success or failure

**2026-09-01, cycle 220.** Fixes finding 4 of
`docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md` — confirmed still present by
that walk and by row 136 (cycle 197) before it. No email sent, no client data touched or
deleted, no schema change. No score assigned (the row explicitly forbids it).

## What was wrong

`/operations/outbound` (owner-only) had three mutation buttons — **Release stale locks**,
**Requeue**, **Mark VERIFIED_READY**. Each was a plain `<form action={...}>` pointed at a
thin wrapper in `form-actions.ts` that called the real server action and threw the result
away:

```ts
export async function releaseStaleFormAction() {
  await releaseStaleProcessingAction(); // return value discarded
}
```

The underlying actions in `actions.ts` already returned real results
(`{ released: number }`, `{ ok: boolean; error?: string }`), and already only called
`revalidatePath` on success — so a refused mutation (e.g. requeueing a row that already has
a provider message id) left the page showing stale data with **no error, no success
message, and no pending state**. An owner clicking "Requeue" could not tell a silent
refusal from "it's still working" from "I mis-clicked," and a successful stale-lock release
never said how many locks it actually released.

## What changed

- **`src/components/ops/operator-action-messages.ts`** (new) — pure functions mapping each
  action's real result to banner text: `releaseStaleLocksMessage(released)`,
  `requeueResultMessage({ok,error})`, `actionErrorMessage(thrown)`, and the fixed
  `VERIFY_SENDER_SUCCESS_MESSAGE`. No JSX, no React — this is the part that is directly
  unit-tested.
- **`src/components/ops/operator-mutation-buttons.tsx`** (new) — three client components
  (`ReleaseStaleLocksButton`, `VerifySenderReadyButton`, `RequeueFailedButton`) using
  `useTransition` for a real pending/disabled state, calling the real server actions from
  `actions.ts` directly (same pattern already established by
  `src/components/ops/admin-queue-drain-panel.tsx`), and rendering the result or the
  caught error as an inline banner instead of discarding it.
- **`src/app/(app)/operations/outbound/page.tsx`** — the three `<form action={...}>` blocks
  replaced with the new components.
- **`src/app/(app)/operations/outbound/form-actions.ts`** — deleted. It had no other
  callers and its entire job (calling the action, discarding the result) is now done
  correctly by the client components.

## Proof it fires, not just exists

Two files carry the load-bearing, red-first proof (both fail — one on missing module, one
on missing file — with the fix reverted; confirmed by stashing the implementation and
re-running):

- **`src/components/ops/operator-action-messages.test.ts`** — asserts a refused requeue's
  real error text (`"Could not requeue — only FAILED rows..."`) comes through unchanged,
  asserts a release of `3` locks reports `"Released 3 stale processing locks..."` (not just
  "it ran"), and asserts a caught `Error("Forbidden")` surfaces its own message.
- **`src/components/ops/operator-mutation-buttons-wiring.test.ts`** — source-text wiring
  test (same pattern as `admin-gate.test.ts` / `reply-claim-wiring.test.ts`, since this
  suite is DOM-free — `vitest.config.ts` runs `environment: "node"`, no jsdom): confirms
  the page no longer imports the discarding `form-actions.ts` wrapper, confirms all three
  buttons are mounted, confirms each disables on `useTransition`'s `pending`, confirms each
  reads its action's return value into the banner instead of discarding it, and confirms
  every failure path is caught and rendered rather than swallowed.

Additionally, **`src/app/(app)/operations/outbound/actions.test.ts`** (new) pins the
server-side behaviour the UI now depends on: `operatorRequeueFailedAction` returns
`{ok:false, error:"Could not requeue..."}` and skips `revalidatePath` when the underlying
update matches zero rows, returns `{ok:true}` and revalidates when it matches one, and
`releaseStaleProcessingAction` reports the real count in both cases (`0` and `7`).

## Gates run and shown

- `npm run lint` — 0.
- `npx tsc --noEmit` — 0.
- `npx vitest run` — 3962 passed, 3 failed. All three failures are pre-existing and
  unrelated to this change: `relay/cycle-log-reaches-git.test.ts` correctly flagged that
  this cycle's own `.bidlow/relay/log/cycle-219.md` was untracked (fixed by committing it
  alongside this change, per that test's own instructions — "committing it is THIS cycle's
  job"); `src/instrumentation.test.ts` and
  `src/lib/monitoring/sentry-config-wiring.test.ts` timed out only under full-suite
  parallel load and passed in under half a second each when re-run in isolation — resource
  contention, not a regression (neither file was touched by this change).
- Red-first proof: stashed `operator-action-messages.ts`, `operator-mutation-buttons.tsx`,
  and the `page.tsx`/`form-actions.ts` reversion, re-ran the new test files — both the
  messages test and the wiring test failed (module not found / file not found), confirming
  they are capable of catching the regression they exist to prevent. Restored the stash
  before committing.

## Merge

Branch `fix/row157-ops-mutation-feedback`, merged to `main` after green CI. Merge commit
hash recorded in the cycle 220 log and in `.bidlow/relay/QUEUE.md` row 157, confirmed live
on `origin/main` via `git ls-remote origin refs/heads/main`.
