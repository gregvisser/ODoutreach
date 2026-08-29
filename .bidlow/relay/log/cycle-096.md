# Cycle 96 — row 85, the sign-in window that closed two months ago

## PR sweep at cycle start

`gh pr list --state open` returned `[]`. Nothing open, nothing to merge. Cycle 95
closed its own PR (#375) before ending, which is the behaviour the sweep exists
to enforce.

## The row was right about the defect and wrong about the evidence

Row 85 asked for one thing before any code: **measure `oauthStateExpiresAt` on
the 8 stranded rows**, because "cycle 64 only added that column recently, so the
8 existing rows probably have it NULL", and decide explicitly what NULL should
say rather than letting it fall through.

That instruction was right, and following it is what stopped this cycle building
the wrong thing. The premise behind it is backwards:

* Cycle 64 (`bdf11ea`) added the **check**, `isMailboxOAuthStateExpired`. It did
  not add the column.
* `oauthState` and `oauthStateExpiresAt` shipped **together**, on 2026-04-20, in
  `20260420120000_mailbox_oauth_connection` — a single migration, verified by
  grepping every migration in the repo for either name and finding exactly one
  file.
* `prepareMailboxOAuthConnection` has written the expiry beside the state, in the
  same update, ever since.

So every row prepared in the last four months carries a real expiry, and the 8
stranded rows are all aged 67 days or less. The prediction could not have held.

## The measurement

`gh workflow run mailbox-credential-probe.yml`, **run 33245630085**, read-only,
against production, 2026-08-29 09:30 UTC. The probe already *selected*
`oauthStateExpiresAt` and had never printed it, so the first change of the cycle
was to make it report the fact the row turns on.

**All 8 stranded rows hold a real expiry. All 8 have CLOSED. Not one is NULL.**

| workspace | provider | window closed | age |
|---|---|---|---|
| protech-roofing | MICROSOFT | 2026-06-29T11:09:26.937Z | 60 d |
| protech-roofing | MICROSOFT | 2026-06-22T09:48:01.492Z | 67 d |
| chevron-security | MICROSOFT | 2026-06-30T11:07:27.779Z | 59 d |
| chevron-security | MICROSOFT | 2026-06-30T11:07:48.882Z | 59 d |
| panda-recycling | MICROSOFT | 2026-06-29T11:03:20.023Z | 60 d |
| opensdoors | MICROSOFT | 2026-07-03T11:32:30.853Z | 56 d |
| greentheuk | GOOGLE | 2026-07-02T08:53:50.962Z | 58 d |
| greentheuk | GOOGLE | 2026-08-26T15:06:34.098Z | 2 d |

27 of 55 live mailboxes can send — unchanged from cycles 73 and 95.

Worth noting for a later cycle: the closure dates track the `updatedAt` ages
cycle 95 used as a proxy, to the day, in all eight cases. `oauthStateExpiresAt`
is the better signal of the two, because it is not a proxy at all — it is
definitionally the moment `prepare` ran, plus fifteen minutes.

## What was built

The window is open **exactly** when the shipped `isMailboxOAuthStateExpired` —
the predicate both OAuth callbacks apply before they will accept a returning
sign-in — says the callback would accept the round trip.

That shared predicate is the whole of it. It means the screen offers to finish a
sign-in precisely when the server would accept one, so it can never invite an
operator into a round trip that is already refused. A local copy of the same
arithmetic would be free to drift, and drift here means lying to an operator. A
property test drives the equivalence across a long-closed window, one
millisecond past, the inclusive boundary, an in-flight window, and NULL.

* **Open** → unchanged. "Needs approval / Finish sign-in in the Microsoft or
  Google window, or press Connect again." Correct for those fifteen minutes, and
  pinned by a must-not-change test.
* **Closed** → "Sign-in never finished", naming the date it closed and saying
  that a fresh Connect is what is needed.

### The NULL decision, made rather than defaulted

NULL reads as **closed**. Two independent grounds, both provable from shipped
code rather than assumed:

1. `isMailboxOAuthStateExpired(null)` is `true`, and both callbacks gate on it
   *first*. The server would refuse a returning sign-in on such a row outright.
   Telling an operator to go and finish it would be telling them to do something
   the product refuses.
2. Every writer of `oauthStateExpiresAt: null` in this codebase — both callbacks
   on success and on every failure, the provider-change path, the
   remove-from-workspace path, the prepare-failed paths — moves the row off
   `PENDING_CONNECTION` in the *same* update. The pairing is one the current code
   cannot produce.

So it is a **defensive** branch, not a live one, and the honest consequence is
that it must not fabricate a closure date it does not have. Its copy says there
is no sign-in in progress and to start a fresh one; a test asserts the sublabel
contains no four-digit year, so a future edit cannot quietly invent a date.

### Three call sites, not the one the row named

The row named `mailboxRowOperatorStatus`. The identical sentence also sat in
`providerConnectionHint`, and `connectActionLabel` rendered **"Complete
sign-in"** — a button promising to *resume* a flow that is gone.

Fixing the status label and leaving the same sentence one function along is the
"known identical hole in the sibling writer" that cycle 94 called a false claim.
All three now read one shared `pendingConnectionStatus`, so a row's status badge
and its expanded hint cannot tell an operator two different stories.

### Dates in UTC, deliberately

Formatted from UTC parts rather than `date-fns` or `toLocaleDateString`. This
module renders inside a client component: a timezone-dependent format produces
one date on the server (Azure runs UTC) and another in a London browser on a
late-evening timestamp — a hydration mismatch on a date the operator cannot
check. One timezone, one answer. A test pins it with 00:30 UTC on 3 July, which
is 2 July in New York.

## Red first

`src/lib/mailboxes/mailboxes-operator-model.test.ts` — **4 failed, 26 passed**
before the implementation.

The 26 that passed are the point of them: an in-flight sign-in still reading
exactly as it does today, CONNECTED and DRAFT rows unaffected by a stale expiry,
and a deleted account still outranking a closed window (there is no sign-in to
start for an account that no longer exists, so "press Connect" must not be
offered to it). All green throughout.

One pre-existing assertion had to change, and it is worth recording why rather
than burying it. `it("uses plain labels for key states")` built a
`PENDING_CONNECTION` row with **no expiry at all** and asserted "Needs approval".
That is precisely the state eight production mailboxes had been sitting in for up
to 67 days — the test was encoding the defect. It was corrected to supply a live
window for the "Needs approval" case, preserving its original intent, and a
second assertion was added for the dead-window copy so the PR #139 guard against
"mailbox owner" jargon now covers both sentences. Corrected, not weakened.

## Proven to fire, not merely to exist

The house defect this repository is worst at is machinery that is built, wired,
reports success and never fires. Unit tests prove the rule over fixtures;
fixtures cannot say what a production row will render.

So the probe now renders each real stranded row through the **shipped**
`pendingConnectionStatus` and prints the exact sentence the operator will see.
**Run 33246187533**, read-only, against production:

```
operator sees: "Sign-in never finished" — The sign-in window closed on 29 Jun 2026
and can no longer be completed. Press Connect to start a fresh sign-in — someone
who can sign in to this mailbox has to finish it.
```

All eight rows print it, each with its own true closure date — 29 Jun, 22 Jun,
30 Jun, 30 Jun, 29 Jun, 3 Jul, 2 Jul and 26 Aug 2026. Not one still reads "Finish
sign-in in the Microsoft or Google window."

## Gates

| gate | result |
|---|---|
| `npm run lint` | 0 |
| `npx tsc --noEmit` | 0 |
| `npm test` | 3626 passed, 347 files |
| `npm run build` | green (webpack) |

No schema, no migration, no client data moved, **no email sent**. Nothing in
this cycle touches the send path.

## Deliberately not done

* **Row 86** — a failed reconnect demoting a mailbox whose stored credential may
  still be good — lives in the OAuth callbacks and is a credential-lifecycle
  concern, not a labelling one. Left alone, exactly as cycle 73 left this row.
* The eight mailboxes are still off the air. Nothing here reconnects them, and
  nothing can: that needs each mailbox owner to sign in at their provider. Row 84
  is BLOCKED on Greg for that, and cycle 95 already routed it into his daily
  digest.

## Open questions for Greg

None new. The two standing ones from row 84 are unchanged and still his:
chasing the eight reconnects across five workspaces, and whether to publish the
Google OAuth app. What this cycle changed is that when somebody does go and look
at one of those rows, the screen now tells them the truth about it.
