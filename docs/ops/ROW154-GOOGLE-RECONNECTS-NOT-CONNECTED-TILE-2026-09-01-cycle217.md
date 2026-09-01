# Row 154 — Google-reconnects' "Already expired" tile missed never-connected mailboxes (2026-09-01, cycle 217)

**Raised by:** row 136 (cycle 197), finding 1 —
`docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md`.

## The bug

`/google-reconnects` shows three headline tiles above the (already-correct) per-row
table. `overdueCount` — the "Already expired" tile — was computed as:

```ts
entries.filter((e) => e.countdown?.status === "overdue").length
```

`countdown` is forced `null` by `resolveGoogleReconnectCountdown` for any mailbox that
is not currently `CONNECTED` (`src/lib/mailboxes/google-refresh-token-expiry.ts:121-122`).
A mailbox stuck in `PENDING_CONNECTION` — a sign-in started and never finished,
greentheuk's exact state, one row stuck 59 days — was never `CONNECTED`, so it never had
a token to expire and could never be counted as "overdue." The tile's own caption reads
"These mailboxes are not sending," which is equally true of a stuck sign-in, but the
number read 0.

The per-row table was already correct (`needsAttention` defaults `true` with no
countdown, `google-reconnect-roster.ts:105`, and the row's own label already says "Not
connected — a sign-in was started and never finished. Press Connect."). Only the
summary count was wrong.

Note on scope: on inspection, the "Need reconnecting" tile (`dueSoonCount`) was **not**
separately affected — it is `dueSoon.length`, and `dueSoon` filters on `needsAttention`,
which already defaults `true` for a non-connected row. Only `overdueCount` had the gap.
This narrows the row-136 finding's framing ("the three headline tiles... do not count
this failure mode") to the one tile that was actually wrong; the fix below still adds
visibility rather than relying on that narrower reading.

## The fix

Added a new roster field, `notConnectedCount` — every Google mailbox with no live token
at all (`countdown === null`, i.e. `PENDING_CONNECTION`, `CONNECTION_ERROR`,
`DISCONNECTED`, or `DRAFT`) — computed in `buildGoogleReconnectRoster`
(`src/lib/mailboxes/google-reconnect-roster.ts`).

Added a fourth summary tile, "Not connected," to `/google-reconnects`
(`src/app/(app)/google-reconnects/page.tsx`), reading `roster.notConnectedCount`, with
its own hint ("Sign-in never finished, failed, or was disconnected — also not sending")
and the same red styling as "Already expired" when non-zero. "Already expired" is left
scoped to an actually-decayed token (not conflated with never-connected, which is a
different failure with a different remediation story already told correctly in the
per-row table) — the brief explicitly allowed either broadening that tile or adding a
distinct one; a distinct tile keeps the two failure modes from being described by one
number. The tile grid changed from `sm:grid-cols-3` to `sm:grid-cols-2 lg:grid-cols-4`
to fit the fourth card.

No schema change. No copy on any other page changed. `alert-copy.ts` (the daily digest)
is untouched — that gap is row 155's, not this one's.

## Proof it fires

`src/lib/mailboxes/google-reconnect-roster.test.ts` — new test "counts not-connected
mailboxes separately, so a stuck sign-in is never invisible in the headline tiles (row
154)": seeds a `PENDING_CONNECTION`, a `CONNECTION_ERROR`, and a `DISCONNECTED` mailbox
alongside one genuinely overdue mailbox, and asserts `overdueCount === 1` (unchanged) and
`notConnectedCount === 3` (new). Failed red before the roster change
(`expected undefined to be 3`), green after.

`src/app/(app)/google-reconnects/google-reconnects-page-copy.test.ts` — new test
asserting the page source references `roster.notConnectedCount` and renders a "Not
connected" tile. Proven red by stashing just the `page.tsx` change (`git stash push --
"src/app/(app)/google-reconnects/page.tsx"`), confirming the test fails without the
wiring, then restoring it (`git stash pop`) and confirming it passes.

## Gates

- `npm run lint` — 0 problems.
- `npx tsc --noEmit` — 0 errors.
- `npm test` — 380 files / 3925 tests, all green (includes the two new test files and
  the two new tests inside the existing roster spec).

## What this did NOT touch

No real email sent, no client data read or written — this is a UI/tally fix over the
existing roster data shape only. No production migration; no schema change at all.
`alert-copy.ts` / the daily digest (row 155) untouched. `settings/internal-seed`,
support-ticket validation (row 156), and `/operations/outbound` button feedback (row
157) — all separately-raised findings from the same row-136 walk — untouched, as scoped.
