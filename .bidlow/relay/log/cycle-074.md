# Cycle 74 — queue row 83: the seven-day Google clock now has a countdown and an alarm

Merged as **#339**, squashed to **`22f27bd`**. Row 74 (Connect no longer
destroying a working credential) landed first in `08b8fc2`, as the brief
required.

## The PR sweep, first

`gh pr list --state open` found **one** open PR, #338 (`docs(state)`), with CI
still running. Waited, confirmed both checks SUCCESS and `mergeStateStatus`
CLEAN, merged it. Auto-merge is **not enabled on this repository**
(`enablePullRequestAutoMerge` refused), so `gh pr merge --auto` is not available
to future cycles — merge manually once green.

The queue ended this cycle at **zero open PRs**.

## What was actually built

The owner's decision of 2026-08-28 keeps the Google OAuth app unpublished, so
Google expires every Google Workspace mailbox's refresh token seven days after
consent and OpensDoors reconnect by hand, weekly. Nothing warned; the way an
expiry was discovered was that outreach stopped.

* **`src/lib/mailboxes/google-refresh-token-expiry.ts`** — the countdown. A pure
  function of `connectedAt` and a clock, so nothing new is captured. Formats the
  deadline in **UTC**, because the same label is rendered in a browser and in a
  Node alert script and a local-time format would print two different deadlines
  for one mailbox.
* **`src/lib/mailboxes/google-reconnect-roster.ts`** — every Google mailbox,
  most urgent first, with the counts and per-client grouping. One roster read by
  three surfaces so the row, the screen and the email cannot disagree.
* **The mailbox row** — `Google — reconnect by 4 Sep 2026, 5 days left`, and
  `Reconnect needed — this Google login expired on 4 Sep 2026` past the
  deadline. Microsoft rows unchanged: the resolver returns null for them.
* **`/google-reconnects`** — the weekly chore on one screen instead of eighteen.
  Put in the sidebar deliberately, unlike `/operations`: all staff do the
  reconnects, and a chore nobody can find does not get done.
* **The daily digest** — a Google section: `PARTIAL` naming the client and each
  mailbox due, `FAILED` if the check itself could not run. `alerts.yml` now
  carries `PRODUCTION_DATABASE_URL`.

## Red first, which the brief demanded and which paid

The day count is pure arithmetic, so it was driven from a **fixed** consent date
against a stub before the module existed. **16 assertions failed** — including
7, 5, 1, 0 and overdue. Roster: red on 9 of 9. Alert copy: red on 9 of 11.

## Assume the seventh exists — proven to FIRE

Dry-run of `alerts.yml` on the branch, run **33214655674**, against the **real
production database**. Nothing sent. It composed:

```
  Google logins: 8 of 8 need reconnecting
      GreenTheUK
        adam@greentheuk.com — Not connected — a sign-in was started and never finished. Press Connect.
        joe@greentheuk.com  — Not connected — a sign-in was started and never finished. Press Connect.
        josh@greentheuk.com — Not connected — the last sign-in failed. Press Connect.
      Train Hugger
        alex@trainhugger.com … taylor@trainhugger.com (5 rows)
```

The subject correctly stayed with the genuinely broken job (`reply &
do-not-contact sync partly failed`) rather than being displaced by the reconnect
notice — the documented ranking, confirmed live rather than assumed.

**Honest limit, stated rather than rounded up:** none of the 8 production Google
mailboxes is CONNECTED today, so that live run exercised the *not-connected*
branch. The 7/5/1/0 countdown is proven by unit tests only, until somebody
reconnects a mailbox. It has not been demonstrated on a live row.

## A correction to the brief, as instructed

Row 83 said nothing warned at all. That is very slightly overstated. There
**was** an inline day-6 nudge at `client-mailbox-identities-panel.tsx` — one
day of notice, no deadline date, no overdue state, no test, and the arithmetic
buried in a `.tsx`. The substance of the row stands: no countdown, no deadline,
no overdue state, no alert, no cross-client screen. This replaces that nudge
rather than sitting beside it, so there is one number in one place.

## Operational finding for Tuesday 1 September

All **8** Google mailboxes across GreenTheUK and Train Hugger are off the air
**right now** — 2 stranded mid-Connect (`PENDING_CONNECTION`) and 6 with a
failed sign-in (`CONNECTION_ERROR`). Greg is on site pressing Connect; this is
the list, and `/google-reconnects` now shows it without opening 18 workspaces.

## Not touched

No schema change and no migration — the countdown is arithmetic over rows
already stored. No send path. No Microsoft behaviour. No client data moved; the
production read is read-only.

## Gates, run and shown

`npm run lint` 0 · `npm run typecheck` 0 · `npm test` **3122 passed** (314
files) · `npm run build` ok with `/google-reconnects` present in the route list.
CI on #339: `verify` pass, `E2E (Playwright)` pass.

## Open question for Greg (1)

The digest now raises to **PARTIAL** whenever any Google mailbox needs
reconnecting. With all 8 currently off the air that means a PARTIAL digest every
morning until they are reconnected, which is correct but will look noisy for a
few days. If it is still PARTIAL for Google reasons a fortnight from now, the
threshold — currently two days' notice — is the knob to turn, not the alarm to
switch off.
