# Row 118 — every stranded Google mailbox, its state, and its category

**Date:** 2026-08-30 · **Cycle:** 149 · **Read-only.** No mailbox connection,
send, or delete was performed. No mail was sent from any client, `bidlowai`
included.

## The measured fact

Probe run `33307493700`, `2026-08-30T10:52Z` (`npm run ops:mailbox-credential-probe`,
production, quoted verbatim):

```
Mailbox rows on non-deleted workspaces: 58 (55 live: active and not removed).

Live mailboxes by status and stored credential:
   27  CONNECTED + credential
    3  CONNECTION_ERROR + NO credential
    4  CONNECTION_ERROR + credential
    2  DISCONNECTED + credential
   11  DRAFT + NO credential
    8  PENDING_CONNECTION + NO credential

27 of 55 live mailboxes can send right now (CONNECTED and holding a credential).

*** 8 live mailbox(es) STRANDED by an unfinished Connect — they cannot send: ***

  ...
  jo***@greentheuk.com  [GOOGLE]  workspace greentheuk (ACTIVE)
      pending since ~59 days ago; sending toggle ON; PREVIOUSLY WORKING — last inbox sync 73 days ago
      sign-in window: CLOSED since 2026-07-02T08:53:50.962Z (59 days ago)
      operator sees: "Sign-in never finished" — The sign-in window closed on 2 Jul 2026 and can no longer
      be completed. Press Connect to start a fresh sign-in — someone who can sign in to this mailbox has
      to finish it.
  ad***@greentheuk.com  [GOOGLE]  workspace greentheuk (ACTIVE)
      pending since ~3 days ago; sending toggle ON; PREVIOUSLY WORKING — last inbox sync 52 days ago
      sign-in window: CLOSED since 2026-08-26T15:06:34.098Z (3 days ago)
      operator sees: "Sign-in never finished" — The sign-in window closed on 26 Aug 2026 and can no longer
      be completed. Press Connect to start a fresh sign-in — someone who can sign in to this mailbox has
      to finish it.
```

**Zero of the 27 CONNECTED-and-sendable mailboxes is Google.** All 55 live
mailboxes were counted (27 + 3 + 4 + 2 + 11 + 8 = 55) and the only two Google
rows in the entire live estate are these two `greentheuk` mailboxes, both in
the `PENDING_CONNECTION` group. There is no Google mailbox anywhere in the
`CONNECTION_ERROR`, `DISCONNECTED`, `DRAFT`, or `CONNECTED` groups — the probe
would have enumerated a `CONNECTED + no credential` Google row separately (it
has that branch; it printed nothing there), and the by-status counts above are
exhaustive. **The row's headline claim — "NO Google mailbox in the whole
system can send right now" — is confirmed, and it is these two rows, not a
wider set.**

## What state each row is actually in

Both rows read `connectionStatus = PENDING_CONNECTION`, `hasStoredCredential =
false`. That is the shape `isStrandedByAbandonedConnect`
(`src/lib/mailboxes/mailbox-connect-credential.ts:80`) checks for: someone
pressed Connect, the flow never returned a finished sign-in, and the OAuth
`state` window subsequently expired. This is **not** the Google seven-day
refresh-token expiry (that produces `CONNECTED` rows ageing into
`CONNECTION_ERROR` with an `invalid_grant`/`refresh token` `lastError`,
handled separately by `googleConnectionErrorSublabel` and the
`google-reconnect-roster` weekly-chore screen). It is a stalled *sign-in*, not
an expired *token*. Both rows carry `lastSyncAt` in the past
(73 and 52 days respectively), so both mailboxes worked once and stopped —
they are not mailboxes that were never set up.

## Categorising each row

The brief asks for (a) something the product can fix, (b) something only a
re-consent by the mailbox owner can fix, or (c) a defect in how the product
stores or refreshes Google credentials. Evidence, not assumption:

1. **The bug that used to cause this class of stranding is already fixed.**
   `src/lib/mailboxes/mailbox-connect-credential.ts` documents that
   `prepareMailboxOAuthConnection` used to delete a mailbox's stored refresh
   token and flip it to `PENDING_CONNECTION` *before* the browser reached the
   provider — so one click on Connect could strand a healthy mailbox with no
   way back. That was fixed in commit `08b8fc2` / `da7b1dc`, **2026-08-28**
   (`fix(mailbox): pressing Connect no longer takes a working mailbox off the
   air (#74)`), which added `shouldPreserveMailboxCredentialOnConnect` so a
   mailbox that can send today keeps its secret through the round trip.

2. **Both stranded Google rows predate that fix.** `jo***@greentheuk.com`'s
   sign-in window closed `2026-07-02T08:53:50.962Z` — nearly two months before
   the fix. `ad***@greentheuk.com`'s closed `2026-08-26T15:06:34.098Z` — two
   days *before* the fix landed (the OAuth state TTL is 15 minutes, so the
   Connect attempt itself started shortly before that timestamp, also
   pre-fix). Neither row is evidence of the current code stranding a mailbox;
   both are residue from before the fix existed.

3. **The current callback code cannot produce a silent, unexplained stall.**
   Read `src/app/api/mailbox-oauth/google/callback/route.ts` in full: every
   exit path — expired state, provider `error` param, missing `code`, token
   exchange failure, no refresh token returned, account-mismatch — writes
   through `mailboxOAuthFailedAttemptUpdate`
   (`src/lib/mailboxes/mailbox-oauth-failed-attempt.ts`), which unconditionally
   clears `oauthState`/`oauthStateExpiresAt` and, for a row with no live
   credential to protect (which both of these are), sets
   `connectionStatus: "CONNECTION_ERROR"` plus a `lastError`. There is **no
   code path today** that leaves a row sitting in bare `PENDING_CONNECTION`
   with a since-expired state and no explanation, *except* the browser never
   returning to the callback at all — i.e., the operator started Connect and
   did not finish the round trip (closed the tab, picked a different account,
   walked away, or the provider itself refused to redirect back — see the open
   question below).

4. **The screen already tells the operator the honest, actionable thing.**
   `pendingConnectionStatus` (`src/lib/mailboxes/mailboxes-operator-model.ts:212`)
   is wired live into the Mailboxes panel
   (`src/components/clients/client-mailbox-identities-panel.tsx:755`, calling
   `mailboxRowOperatorStatus` per row) and produces exactly the text the probe
   quoted above: *"Sign-in never finished... Press Connect to start a fresh
   sign-in — someone who can sign in to this mailbox has to finish it."* This
   is the fix from row 85 (`d3db9f1`, 2026-08-29) that replaced a
   permanently-stale "finish the window that's still open" message. Row 111's
   screen-walk (`docs/ops/2026-08-30-screen-walk-findings-row111.md`) covered
   the mailbox-connect area and raised no finding against it. It is not
   leaving the operator guessing.

**Verdict: category (b) for both rows.** No code defect is producing this
today; the defect that used to produce it is fixed. The only thing that
clears `jo***@greentheuk.com` and `ad***@greentheuk.com` is someone who can
sign in to those two mailboxes pressing Connect and completing the Google
consent screen through to the redirect back. That is a complete answer per
the brief's own terms, and no fix was made in this cycle (there is nothing in
category (a) or (c) to fix).

## One open question this repo's code cannot answer, named plainly

`src/server/integrations/google-oauth-test-users/test-users-api.ts` documents
that Google exposes no API for reading the OAuth consent screen's test-user
allowlist — only a link to the Cloud Console, which only a signed-in human
can open (Greg is the sole GCP admin; see prior memory). Per Bidlow's own
policy doc (`GOOGLE-7-DAY-MANUAL-POLICY.md`, `C:\Bidlowbusiness\_odoutreach-handover\`,
outside this repo and not re-argued here), the app is deliberately kept
**unpublished**, which means Google will silently refuse the consent screen
for any Google account that is not on that allowlist — and the refusal never
reaches this application at all, because Google does not redirect back to our
callback in that case. That failure would look **identical**, in this
codebase's data, to an operator simply abandoning the tab: `PENDING_CONNECTION`,
window closed, no `lastError`. I cannot distinguish the two from code or the
database — only the Console can answer it. **What Greg should check before
the next reconnect attempt:** whether `jo***@greentheuk.com` and
`ad***@greentheuk.com` are both currently listed as test users at the link
Settings already provides (`getConsoleTestUsersUrl()`, rendered under
"Google OAuth — test users" in Settings). If either is missing, a fresh
Connect attempt will fail the same way again regardless of who presses it,
and adding them to the allowlist first is the actual unblock — which would
make this closer to a configuration gap than pure (b), even though no code
would need to change.

## What was and was not done

- **Measured, read-only:** the probe above, the schema, the OAuth callback,
  the operator-facing status rules, and the fix history. Nothing was written
  to any database.
- **No fix made.** Categorised as (b); the code defect that used to cause
  this class of row is already fixed (2026-08-28) and nothing else in this
  investigation surfaced a reproducible current-code defect, so there is
  nothing to make red-first here. Per the brief: "if it is (b), that is a
  complete answer."
- **`greentheuk` was examined only, never sent from, per the hard rule** —
  no Connect was pressed, no credential was touched, no email was sent or
  queued.
- **`bidlowai`'s sequence was not touched.**
- **No score, no `.bidlow/GRADES.json`, no dimension.**

## Row 108 verifiability, named honestly

Row 108's Gmail Message-ID read-back is merged and deployed (`d083bfc`), and
it remains **unobservable working** until at least one Google mailbox is
`CONNECTED` and actually sends. That is unchanged by this row: reconnecting
`greentheuk`'s two Google mailboxes needs a human with sign-in access to those
inboxes, and per the hard rule nothing may be sent from `greentheuk` even
after reconnection — only `bidlowai` may send real mail. Row 108 will stay
unverifiable in production until either `bidlowai` itself gains a working
Google mailbox, or the hard rule's scope changes. That is a fact to hand back
to the queue, not something this row can close.
