# Cycle 97 — row 86: a failed reconnect no longer takes a working mailbox off the air

## PR sweep

`gh pr list --state open` returned `[]`. Nothing to merge, nothing to leave a
comment on. The seventeen-PR landfill of 2026-08-28 is cleared and has stayed
cleared for two cycles.

## What the row asked

Both OAuth callbacks answered every failure by writing
`connectionStatus: "CONNECTION_ERROR"`. `sending-policy.ts` gates on
`connectionStatus === "CONNECTED"`, so a failed SIGN-IN ATTEMPT took a mailbox
off the air whose stored credential the attempt never went near.

This became reachable at cycle 73. Before it, `prepareMailboxOAuthConnection`
deleted the credential on the way OUT to the provider, so by the time a callback
ran there was nothing left to protect. Cycle 73 stopped that — a mailbox that
can send keeps its credential and its CONNECTED status for the whole round trip
— and left the same defect one step downstream, which it disclosed rather than
hid. Not a regression: before 73 the mailbox was dead either way.

## The judgement call, made rather than assumed

The row asked whether to defer to `classifyMailboxCredentialFailure` instead of
a blanket CONNECTION_ERROR. **I did not.**

That classifier reads errors produced by *using a stored refresh token* — the
send path and the reply-sync path — where `invalid_grant` genuinely does mean
"the stored grant is dead". A callback's errors come from exchanging a fresh
*authorization code*, where `invalid_grant` means the code was expired, already
spent, or issued for a different redirect URI. That is a fact about the code,
not about the refresh token in `MailboxIdentitySecret`. Handing it to the
classifier returns `reauth_required → CONNECTION_ERROR` and demotes a healthy
mailbox on the strength of an error about an entirely different credential —
the same blanket demotion wearing a classifier's name.

The classifier is not wrong. It is being asked a question it was not built for.
The right question is not "what does this error say about the stored credential"
— the answer is always "nothing, it never touched it" — but "does this row still
hold a credential the send path is using". Cycle 73 already wrote that predicate:
`isMailboxSendingCredentialLive`.

The send and sync paths run every five and fifteen minutes and DO exercise the
stored credential. They are the only code with evidence. Deferring the status to
them is deferring it to the evidence.

### The second half, which the row did not ask for and needed

`lastError` is preserved too, not just the status. Two reasons:

1. `mailboxRowOperatorStatus` checks `isMailboxAccountDeletedError(row.lastError)`
   **ahead of** the status branches. An `AADSTS500341` arriving inside a
   provider's `error_description` would have relabelled a live, sending mailbox
   "Cannot be reconnected" — status preserved, mailbox still sending, screen
   saying it is beyond help. There is a test for exactly this.
2. Not writing it stops the sync path's true diagnosis being clobbered by a note
   about a sign-in attempt.

Nothing is lost. The operator is standing at the screen — that is why cycle 73
judged this safe to defer — and the redirect banner names the failure in the same
words as before. The audit row keeps the provider's text permanently, and now
also carries `credentialRetained`, so the decision is checkable in production
after the fact rather than inferred.

## Correction to the brief

The queue row listed `missing_code` among the write sites. It is not one: that
branch redirects read-only and writes nothing. The real write sites are the
provider-`error` branch and the catch block. QUEUE.md now records this.

## Red-first, proven

Three new callback tests were written before the routes were touched and watched
fail:

```
FAIL  google/callback/route.test.ts > leaves a sending mailbox sending when the wrong account approves
FAIL  google/callback/route.test.ts > leaves a sending mailbox sending when the token exchange is refused
FAIL  google/callback/route.test.ts > leaves a sending mailbox sending when the operator declines at Google
AssertionError: expected { …(4) } to not have property "connectionStatus"
- Expected: undefined
+ Received: "CONNECTION_ERROR"

Tests  3 failed | 22 passed (25)
```

The proof case the row named is the first of those: **account_mismatch**, where
the stored credential is definitely still fine — the exchange succeeded and the
only thing wrong is who was at the keyboard.

Green after the change: 37 tests across the three files, including the other
half of the rule (a row with no stored credential still records the failure, so
a stranded mailbox does not go on reading "Connected" with no explanation).

## Files changed

- NEW `src/lib/mailboxes/mailbox-oauth-failed-attempt.ts` — the pure rule
- NEW `src/lib/mailboxes/mailbox-oauth-failed-attempt.test.ts` — 10 tests
- `src/app/api/mailbox-oauth/google/callback/route.ts`
- `src/app/api/mailbox-oauth/microsoft/callback/route.ts`
- both callback `route.test.ts`
- `.bidlow/relay/QUEUE.md`

Not touched: the success path, `classifyMailboxCredentialFailure`,
`sending-policy.ts`, `prepareMailboxOAuthConnection`, the banner copy, the
schema. No migration.

## Gates

```
npm run lint       clean
npm run typecheck  clean
npm test           3643 passed / 3644
```

The one failure is `relay/cycle-log-reaches-git.test.ts` timing out at 5000 ms
under full-suite load; run alone it passes in 2.3 s. It shells out to git, and
the 5 s budget is not enough on a contended Windows box. Unrelated to this
change, but it is a real flake that will eventually redden CI — recorded here
rather than fixed, because it is outside this cycle's declared files.

## Done, in one sentence a non-coder can check

If someone starts a mailbox reconnect and it fails — they sign in as the wrong
person, they press Deny, the provider refuses — a mailbox that was sending fine
a minute ago is still sending fine a minute later, and they are told what went
wrong on screen.
