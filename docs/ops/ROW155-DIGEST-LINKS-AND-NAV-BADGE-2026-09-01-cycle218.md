# Row 155 — digest lines link to the fix screen, sidebar badges when a mailbox needs attention

Cycle 218, 2026-09-01. Raised by row 136 (cycle 197), finding 2: nothing outside the
single-recipient daily digest ever surfaced a broken Google mailbox to anyone but Greg, and
even that digest didn't link anywhere. No application code outside the files below changed.
No email was actually sent (dry-run/tests only) and no real client data was touched or
deleted — this row explicitly bars scoring or sending. No schema change, no migration.

## Fix 1 — every broken-mailbox line in the digest now carries a direct link

`buildAlertEmail` (`src/lib/alerts/alert-copy.ts`) previously rendered each Google-reconnect
and stranded-mailbox line as `"${entry.email} — ${entry.label}"` with no URL at all — even
Greg, the digest's one recipient, had to already know where `/google-reconnects` or a given
client's Mailboxes tab lived.

- Both `GoogleReconnectAlert.dueSoonByClient[]` and `StrandedMailboxAlert.strandedByClient[]`
  now carry `clientId` alongside `clientName` (the id was already available on the roster —
  `GoogleReconnectClientGroup.clientId` / `StrandedMailboxClientGroup.clientId` in
  `src/lib/mailboxes/*-roster.ts` — it was just dropped when `scripts/ops-alert.ts` mapped the
  roster into the alert's input shape).
- `buildAlertEmail` takes a new optional `appBaseUrl` (defaults to the exported
  `DEFAULT_ALERT_APP_BASE_URL`, the same value `scripts/ops-alert.ts`'s own `ALERT_APP_URL`
  fallback now imports, so the two cannot drift into disagreeing about where the app lives).
  A `mailboxesTabLink` helper builds `${appBaseUrl}/clients/${clientId}/mailboxes` and every
  line under a client group now ends with that link — the specific client's Mailboxes tab, not
  just the generic `/google-reconnects` list, since that is the one screen with the Reconnect
  button.
- `scripts/ops-alert.ts` now threads `clientId` through both roster→alert mappings and passes
  `appBaseUrl: appUrl` into `buildAlertEmail`.

**Red-first:** `alert-copy-google-reconnects.test.ts` and `alert-copy-stranded.test.ts` each
got two new tests — "gives every broken-mailbox line a link" (explicit `appBaseUrl`) and
"still links each line when no appBaseUrl is supplied" (default). Run against the unmodified
code first: both failed with `expected '...a@trainhugger.com — Google — ...' to contain
'https://.../clients/.../mailboxes'` — the line existed but carried no link at all. Green
after the fix. Three existing fixture literals (`dueSoonByClient`/`strandedByClient` groups in
the two test files) needed a `clientId` added once the type made it required — `tsc --noEmit`
caught the one fixture missed on the first pass (`alert-copy-stranded.test.ts:123`, the "newly
off the air" case).

## Fix 2 — the sidebar's "Google logins" entry now badges when mailboxes need attention

`nav-config.ts`'s `mainNav` was a static array with no way to carry a live count — the PR #139
audit locks its exact shape, so it stays untouched. A new pure function,
`buildMainNav(googleReconnectsAttentionCount: number): NavItem[]`, maps over it and attaches
`badge: count` to the `/google-reconnects` entry only when `count > 0`; `NavItem` gained an
optional `badge?: number` field.

The real count comes from a new `getGoogleReconnectNeedsAttentionCount()` in
`src/server/queries/google-reconnects.ts` — it reuses the same `buildGoogleReconnectRoster`
the page and the digest already read (`dueSoonCount`), reading every live Google mailbox
directly rather than through `getAccessibleClientIds`, since roles were removed and every
active staff member already sees every live client (`src/server/tenant/access.ts`). It is
computed once per request in `src/app/(app)/layout.tsx` (wrapped in `.catch(() => 0)` — a
failed count must not break every page) and threaded down as a prop:
`layout.tsx` → `AppSidebar` (desktop) and `layout.tsx` → `AppHeader` → `AppSidebar` (mobile
sheet). `AppSidebar` renders the badge as a small pill next to the item's title.

**Red-first:** this codebase has no React component-render tests (`npm test` is documented as
"unit/pure" only), so the seam that can actually go red is the pure `buildMainNav` function —
a new `nav-config.badge.test.ts` asserting a non-zero count produces `badge === count` on the
Google-logins entry, zero produces `badge === undefined`, no other entry is ever touched, and
the shared static `mainNav` array is never mutated. Run before `buildMainNav` existed: failed
to resolve the import (module has no exported member `buildMainNav`) — a compile-time red,
which is this repository's established substitute for a runtime assertion failure when a
function doesn't exist yet. Green after adding it.

The actual wiring from a real DB count down to the rendered pill (`layout.tsx` →
`AppSidebar`/`AppHeader`) is not covered by an automated test — there is no harness in this
repo for that, and building one was out of this row's scope. It is a direct, three-hop prop
thread with no branching logic beyond the `.catch(() => 0)` already covered by TypeScript, so
the risk left unverified is narrow: a change to the query's return type going unnoticed until
build/typecheck fails.

## What was NOT touched

No send/suppression logic, no schema, no migration, no other queue row's files. Nothing under
`_standards`. No real email sent — `scripts/ops-alert.ts --dry-run` and the vitest suite are
the only things that ran it.

## Gates

- `npm run lint` — 0 problems.
- `npm run typecheck` (`tsc --noEmit`) — 0 errors (after the one missed `clientId` fixture was
  added).
- `npm test` — 381 files / 3933 tests green. One test outside this row's scope
  (`relay/cycle-log-reaches-git.test.ts`) failed at the START of the cycle because the
  previous cycle's log (`cycle-217.md`) was untracked — expected per that test's own message;
  fixed by committing the log as part of this cycle, per this repo's standing housekeeping
  rule ("clear the green PRs / commit the previous log" at the top of every cycle brief).
