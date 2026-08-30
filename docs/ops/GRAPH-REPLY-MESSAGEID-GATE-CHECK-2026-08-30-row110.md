# Row 110 — gate check: is row 108 observed working in production?

Cycle 136. Row 110 (the Microsoft Graph half of definitive reply matching) is
explicit: **"DO NOT START THIS UNTIL ROW 108'S GMAIL FIX IS MERGED, DEPLOYED
AND OBSERVED WORKING IN PRODUCTION — if it is not, leave this row TODO and say
so in your log."** This artefact is that check, and its answer, done before
any Microsoft Graph code was touched.

## What "merged" and "deployed" already show

Row 108 (cycle 135) merged to `main` as `d083bfc` (PR #432) and was confirmed
live on the direct App Service origin — `GET /api/build-info` on
`app-opensdoors-outreach-prod.azurewebsites.net` returned
`"commit":"d083bfc34cf3260eb9e2823bedf628e98aded9e9"`. Those two bars are met.

## What "observed working in production" requires, and what was measured

"Observed working" is a third, higher bar than "deployed": it means a real
Gmail send has actually gone through the deployed code path and the read-back
(`captureDeliveredGmailMessageIdBestEffort` / `fetchDeliveredGmailMessageId`)
has actually fired — corrected an `rfc822MessageId`, or at minimum been
invoked. Deployed-but-never-executed code is exactly the failure pattern this
project's own queue calls out repeatedly ("built, wired, reporting success,
and never firing").

Two independent, read-only production checks, both via a temporary Azure
Postgres firewall rule scoped to this machine's IP only, opened and removed
within this cycle (no credential or connection string was ever printed or
persisted to disk; the check script was deleted after running):

**1. Has any Gmail send happened since row 108 deployed (2026-08-30T07:28:27Z)?**

```sql
SELECT o.id, o."sentAt", o."providerMessageId", o."rfc822MessageId"
FROM "OutboundEmail" o
JOIN "ClientMailboxIdentity" m ON m.id = o."mailboxIdentityId"
WHERE m.provider = 'GOOGLE' AND o."sentAt" IS NOT NULL
  AND o."sentAt" > '2026-08-30T07:28:27Z'::timestamptz
```

Result: **zero rows.** No Gmail send of any kind has occurred since the
deploy.

**2. When did a Gmail send last happen at all, and can one happen right now?**

```sql
SELECT count(*) AS c, max(o."sentAt") AS last_send
FROM "OutboundEmail" o
JOIN "ClientMailboxIdentity" m ON m.id = o."mailboxIdentityId"
WHERE m.provider = 'GOOGLE' AND o."sentAt" IS NOT NULL
```

Result: 1,095 Gmail sends total, **most recent 2026-07-03T14:35:57Z** — almost
eight weeks ago. And every Google mailbox's current connection state:

| mailbox | connectionStatus |
|---|---|
| adam@greentheuk.com | PENDING_CONNECTION |
| alex@trainhugger.com | CONNECTION_ERROR |
| cam@trainhugger.com | CONNECTION_ERROR |
| joe@greentheuk.com | PENDING_CONNECTION |
| joe@trainhugger.com | CONNECTION_ERROR |
| josh@greentheuk.com | CONNECTION_ERROR |
| sam.p@trainhugger.com | CONNECTION_ERROR |
| taylor@trainhugger.com | CONNECTION_ERROR |

**Zero of eight Google mailboxes are `CONNECTED`.** This matches cycle 135's
own finding (all 4 credentialed Google mailboxes failed OAuth token refresh
with `invalid_grant`) and this project's standing mailbox-credential-health
record. It also explains why no Gmail send has happened in almost two months:
not "no traffic today," but no Google mailbox in the system is currently
capable of sending at all.

Separately, and independently sufficient on its own: today (2026-08-30) is a
**Sunday**, and `.github/workflows/process-outbound-queue.yml` runs only
`*/5 7-18 * * 1-5` — weekdays. No automated send of any kind, Gmail or
Graph, will fire today regardless of mailbox health.

## Conclusion

Row 108's fix is merged and deployed, but it has not been, and currently
**cannot be**, observed working in production — there has been no Gmail send
since it deployed, and no Google mailbox in the system is presently connected
well enough to send one. This is not a timing gap that a later check today
would close; it is a structural block (dead credentials, non-sending day)
that a Sunday production reading cannot see past.

Per row 110's own explicit instruction, this row is left `TODO` rather than
started. No Microsoft Graph code, test, or send-path file was touched this
cycle. Re-attempt once (a) at least one Gmail mailbox reconnects and sends
successfully after row 108's deploy, confirming the read-back actually fires
and corrects an `rfc822MessageId` in a real row, or (b) a deliberate decision
is made that Graph's own gate does not need Gmail's to have fired first (that
would be a change to the brief, not something this cycle can decide).

## Scope and hard rule

No email sent, no client data written or mutated — every production query run
was a single `SELECT` inside `BEGIN READ ONLY`. The temporary Postgres
firewall rule (scoped to this machine's IP, name `temp-cycle136-readonly`)
and the ad-hoc read-only check script were both created and removed within
this cycle. No schema change. No migration. The Microsoft Graph send path,
`process-synced-replies.ts` legs 2/3, and the 1,095 historical un-stamped
Graph rows are all untouched. `bidlowai` was not queried or touched (its own
mailbox sends via `microsoft_graph`, not Gmail, so it has no Gmail rows in
scope here anyway).
