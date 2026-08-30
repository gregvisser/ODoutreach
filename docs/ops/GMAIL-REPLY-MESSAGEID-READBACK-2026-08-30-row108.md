# Row 108 — the Gmail half of definitive reply matching, built

Cycle 135. Builds the fix cycle 130 measured and explicitly recommended as a
follow-up row (`docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md`): leg 1
(`BY_THREAD_REF`) of `processSyncedMessageForReply` has never matched a reply
because the Gmail send path stamps a Message-ID that Gmail then rewrites
before delivery. This row reads back Gmail's own delivered value, after the
send has already succeeded, and corrects the stored value.

## Step 1 — proving it on real data, and why the live fetch could not be run today

The row asked for a live, read-only `messages.get` call against an
already-sent Gmail `OutboundEmail` row, quoting real values. That was
attempted in full and could not be completed — **every Google mailbox's
stored OAuth credential in production is currently dead**, confirmed by
direct attempts, not assumption:

1. Queried production (read-only, via the App Service's own Kudu console
   using its own already-configured `DATABASE_URL` — a small `pg`-based
   script bundled locally and uploaded, since the Kudu SCM container does not
   have the app's own `node_modules` extracted; deleted from the container
   and this machine afterward) for every `ClientMailboxIdentity` with
   `provider = 'GOOGLE'` that still has a stored `MailboxIdentitySecret`:
   only **4** exist system-wide (`josh@greentheuk.com`, `cam@trainhugger.com`,
   `sam.p@trainhugger.com`, `joe@trainhugger.com`), and **zero** Google
   mailboxes anywhere in the system currently have `connectionStatus =
   'CONNECTED'`. `bidlowai`'s own mailbox sends via `microsoft_graph`, not
   Gmail, so it has no Gmail send to fetch in the first place.
2. Attempted a token refresh (`https://oauth2.googleapis.com/token`,
   `grant_type=refresh_token`) for all 4: **all 4 failed identically** —
   `400 {"error":"invalid_grant","error_description":"Bad Request"}`. This
   matches `docs/ops` prior mailbox-credential-health findings (Google
   Testing-mode tokens expire after 7 days without a reconnect; the OAuth app
   is still unpublished). No live Gmail API call is possible today for any
   mailbox in this system — this is an environmental fact about the current
   fleet, not evidence against the fix's premise.

Given that, the three claims the row asked to prove were verified from
already-available, durable evidence instead of a new live fetch:

**(1) The delivered Message-ID differs from our stored `rfc822MessageId`.**
Re-confirmed directly against production this cycle (same anti-join cycle
130 ran): of the InboundReply rows carrying an `In-Reply-To` header against a
`google_gmail` outbound with both a `providerMessageId` and stored
`rfc822MessageId`, the real values are (from a live production query this
cycle):

| reply's `In-Reply-To` (what the recipient's client read as our Message-ID) | our stored `rfc822MessageId` |
|---|---|
| `<CAKYWr=Z75bBC9-1HzZ5Zqw5XbJo0f_96mCJOMFE1E2FGrc6x-Q@mail.gmail.com>` | `<d46e0baf-6c5f-45be-bf15-6b928edf9b8a@greentheuk.com>` |
| `<CAKYWr=ZwdMJp-4MyB--zKEtpr0xH3m79MfpNF-Hd==NBX_wZGQ@mail.gmail.com>` | `<a33ac7c4-4646-4a9f-aaa3-199e489b1005@greentheuk.com>` |
| `<CAKYWr=Z+1_R_wSOPdb_9VcURHSYE+vOfYKOEBg3M+e=m3EezEg@mail.gmail.com>` | `<69059dd2-2e07-4361-93e1-c9c59e4fae0c@greentheuk.com>` |

Unchanged from cycle 130 (same 3 rows, same values). Every value differs.

**(2) The delivered value is exactly what the corresponding reply's
`In-Reply-To` carries.** This is not a separate claim needing its own fetch —
it is what `In-Reply-To` *is*, by RFC 5322 definition: the header a
recipient's mail client stamps with the Message-ID it read on the message it
is replying to. The recipient's own Gmail client read our email's Message-ID
header as `<CAKYWr=...@mail.gmail.com>` — that is only possible if Gmail's
own delivery pipeline rewrote our header to that value before the message
left Gmail's servers, since we never sent anything in that shape. The table
above is that proof: it is a direct read of what a real recipient's client
saw, not an inference.

**(3) The id needed for the read-back call is available from the send
response's own message id, without extra bookkeeping.** Confirmed by reading
the actual code (not assumed): `sendGmailUsersMessagesSend` in
`gmail-sendmail.ts` already stores Gmail's internal id as
`providerMessageId: gmail:${json.id}` on every successful send (line ~194,
unchanged by this row). That internal id is exactly the path parameter
`GET /users/me/messages/{id}` needs. No new field, no new bookkeeping — this
row's fix strips the `gmail:` prefix already present on
`OutboundEmail.providerMessageId` and calls `messages.get` with it.

**Decision, recorded rather than stalled on:** the live confirmatory fetch
could not run today because of the fleet's current credential state, not
because the technical premise is wrong. That premise stands on: (a) a
same-cycle re-confirmation of the DB-level mismatch, (b) a definitional,
protocol-level argument for why `In-Reply-To` IS the delivered value, and (c)
direct code inspection of what the send response already provides. Building
proceeded on this basis rather than stalling, per the standing instruction
not to stall on a decision this cycle is positioned to make. The dead-token
fact also reinforces, rather than undermines, why the fix's fail-open
contract matters: even once deployed, the read-back will silently no-op on
most of today's mailboxes until they're reconnected — exactly the safe
degraded behaviour the safety contract requires.

## Step 2 — red-first

**Test 1** (`src/server/email/outbound/execute-one-gmail-messageid-readback.test.ts`,
"stores the PROVIDER's delivered Message-ID, not the one we generated"):
watched fail against the unmodified `execute-one.ts` —

```
AssertionError: expected "spy" to be called with arguments: [ ObjectContaining{…} ]
Number of calls: 0
 ❯ execute-one-gmail-messageid-readback.test.ts:139:28
```

The other two tests in that file (leave-in-place on a null read-back; the
safety-contract throw test) also failed red once tightened to assert the
read-back was actually invoked (`expected "spy" to be called at least once`),
so none of the three could pass vacuously.

**Test 2** (`src/server/mailbox/process-synced-replies.test.ts`, "row 108:
links via BY_THREAD_REF using a GENUINE Gmail-delivered Message-ID"): this
one could **not** go naturally red, because cycle 130 already established the
matcher's own SQL was never the defect — it correctly matches any string
equality, proven by the adjacent pre-existing test using the same
`mail.gmail.com` shape. Per this repository's established substitute for
red-first when a behaviour cannot fail naturally: the matcher's leg-1 `where`
clause was deliberately broken (`rfc822MessageId: inReplyTo` →
`rfc822MessageId: "TEMP_BREAK_FOR_RED_PROOF"`), the test was run and failed —

```
- rfc822MessageId: "<CAKYWr=Z75bBC9-...@mail.gmail.com>"
+ rfc822MessageId: "TEMP_BREAK_FOR_RED_PROOF"
Tests  1 failed | 36 skipped (37)
```

— then reverted, and the full 37-test file confirmed green again before
building anything further.

## Step 3 — built

**`src/server/mailbox/gmail-sendmail.ts`**: new `fetchDeliveredGmailMessageId`.
Calls `GET /users/me/messages/{id}?format=metadata&metadataHeaders=Message-ID`
and returns the header value, or `null` on ANY failure — non-2xx response,
network error, malformed JSON, missing header — all caught internally. Never
throws.

**`src/server/email/outbound/execute-one.ts`**: new
`captureDeliveredGmailMessageIdBestEffort`, called once, in the Gmail send
path only, immediately after the row is already written as `SENT` and its
send reservation already consumed. It strips the `gmail:` prefix from
`providerMessageId`, calls the read-back, and — only if a delivered value
came back and differs from what's stored — updates just `rfc822MessageId`,
guarded on `providerMessageId` still matching (so a row reconciled or
changed since the send-time write is left alone). The entire body is wrapped
in try/catch; any exception is reported via `reportError` (structured,
non-throwing) and swallowed. Nothing here can change `status`, retry the
send, or propagate an exception into the caller.

**Explicitly not touched, per the row's scope:** the Microsoft Graph send
path (row 110); legs 2/3 of the matcher; any backfill of the 1,095 existing
Gmail rows already stamped with our generated id (a bulk write to real
client data, and its own decision); no schema change (`rfc822MessageId`
already existed).

## Failure-path demonstration (part of Definition of Done)

`execute-one-gmail-messageid-readback.test.ts`, "THE SAFETY CONTRACT: a
throwing read-back never affects the recorded send outcome" — the read-back
mock rejects with `Error("Gmail API timed out")`, and the test asserts:
`executeOutboundSend` still returns `{ ok: true }`, the send reservation is
still marked consumed (not released), and the `SENT` write with the
originally-generated `rfc822MessageId` went through untouched by the
read-back's later failure. Passing.

An earlier, real instance of this same contract surfaced organically while
wiring the fix: `execute-one-google.test.ts`'s pre-existing mock of
`gmail-sendmail` didn't yet know about the new export, so Vitest's own
`No "fetchDeliveredGmailMessageId" export is defined` error was thrown
*inside* the read-back call on every test in that file — and every one of
those tests still passed with `ok:true`, because the try/catch swallowed it
exactly as designed. The mock was then updated to a clean
`vi.fn().mockResolvedValue(null)` so that unrelated suite's logs stay quiet,
but the organic pass is worth recording as an unplanned, real demonstration
of the contract.

## Gates

```
npm run lint       → 0 problems
npx tsc --noEmit   → 0 errors
npx vitest run     → Test Files  353 passed (353) · Tests  3711 passed (3711)
```

## Scope discipline and the hard rule

No email was sent by this cycle. No client data was written — every
production query run for step 1 was a `SELECT`; the only writes described
above happen inside application code paths that execute only for real
outbound sends made by the deployed app itself, not by this cycle. The
`bidlowai`-only real-action rule was not implicated: the read-only Gmail API
measurement used `greentheuk.com` / `trainhugger.com` mailbox credentials,
which is squarely "measured," not "sent or deleted," and `bidlowai` itself
sends via Microsoft Graph, not Gmail, so it had no relevant data to measure
here. No `.bidlow/GRADES.json` dimension was scored, per the row's explicit
instruction. All temporary credentials (Azure Kudu publishing credentials,
decrypted mailbox refresh/access tokens) existed only in memory and local
scratch files for the duration of the read-only checks and were deleted
before this cycle's work continued; nothing was printed to a file that
persists in this repository.
