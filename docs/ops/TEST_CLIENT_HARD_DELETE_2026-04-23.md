# Hard delete of retired test client "ZZZ TEST - OD Mailbox Proof"

**Date:** 2026-04-23
**Operator:** greg@bidlow.co.uk
**Target client:** `cmo2zipl90000ggo8c9j4ysfn`
**Current name / status:** `ZZZ TEST - OD Mailbox Proof` / `ARCHIVED` (soft-retired on 2026-04-23 per PR #64 / `docs/ops/TEST_CLIENT_RETIREMENT_2026-04-23.md`)

This document records the audit, rehearsal, and execution plan used to
permanently remove the retired test client and all of its dependent data
from production.

## Why a new document and a new script

PR #64 intentionally did **not** hard-delete the client. At that time a
static reading of `prisma/schema.prisma` could not prove that:

- client-scoped `ContactList` rows would not be silently re-parented to
  global (`Client -> ContactList` uses `onDelete: SetNull`),
- the `onDelete: Restrict` FKs on
  `ClientEmailSequence.contactListId`,
  `ClientEmailSequenceStep.templateId`,
  `ClientEmailSequenceEnrollment.{contactId, contactListId}`,
  `ClientEmailSequenceStepSend.{stepId, templateId, contactId, contactListId}`
  would not block a top-down cascade mid-transaction,
- explicit orphan rows would not remain via `onDelete: SetNull` on
  `AuditLog.clientId` and `OutboundProviderEvent.clientId`.

To move forward safely we:

1. Ran a live dependency audit against production (with the process env
   `DATABASE_URL` loaded via the proven ARM / TLS 1.2 method and a
   scoped temporary firewall rule).
2. Ran a **transactional rehearsal** against production — the exact
   ordered delete statements, inside a Prisma `$transaction`, that is
   then intentionally rolled back. This proves the ordering works
   against real data without changing anything.

## Live production dependency audit (2026-04-23)

Client snapshot:

```json
{
  "id": "cmo2zipl90000ggo8c9j4ysfn",
  "name": "ZZZ TEST - OD Mailbox Proof",
  "slug": "od-mailbox-proof",
  "status": "ARCHIVED"
}
```

Live counts (every table that references a `clientId` either directly
or transitively, including the sequence-related tables and the
`MailboxIdentitySecret` children of `ClientMailboxIdentity`):

| Table                             | Rows |
|-----------------------------------|------|
| ClientMembership                  | 1    |
| ClientOnboarding                  | 1    |
| ClientMailboxIdentity             | 4    |
| MailboxIdentitySecret             | 3    |
| InboundMailboxMessage             | 77   |
| MailboxSendReservation            | 5    |
| Contact                           | 2    |
| ContactImportBatch                | 0    |
| RocketReachEnrichment             | 2    |
| ContactListMember                 | 0    |
| ContactList (client-scoped)       | 0    |
| SuppressionSource                 | 2    |
| SuppressedEmail                   | 1    |
| SuppressedDomain                  | 4    |
| UnsubscribeToken                  | 0    |
| Campaign                          | 0    |
| OutboundEmail                     | 5    |
| OutboundProviderEvent             | 0    |
| InboundReply                      | 0    |
| ReportingDailySnapshot            | 0    |
| AuditLog                          | 37   |
| ClientEmailTemplate               | 0    |
| ClientEmailSequence               | 0    |
| ClientEmailSequenceStep           | 0    |
| ClientEmailSequenceEnrollment     | 0    |
| ClientEmailSequenceStepSend       | 0    |

Additional checks:

- `globalListRowsReferencingClient = 0` — no client contacts appear in
  any global (`clientId IS NULL`) list; no global list content will be
  touched.
- No client-scoped `ContactList` rows exist, so the
  `Client -> ContactList SetNull` reparenting risk is zero for this
  client.
- No rows exist in any `Restrict`-FK-prone table
  (`ClientEmailTemplate`, `ClientEmailSequence`,
  `ClientEmailSequenceStep`, `ClientEmailSequenceEnrollment`,
  `ClientEmailSequenceStepSend`), so the `Restrict` FKs cannot bite
  for this client. The script still orders the deletes correctly for
  safety.

Cross-client impact: none. Every row above is scoped to this
`clientId`. The only tables where this client could co-exist with
rows from other clients are `ContactList` (clientScoped count = 0,
global not touched) and `StaffUser` (only linked via
`ClientMembership` / `createdBy*` fields — `StaffUser` rows are
never touched, only the join row is removed).

## FK cascade behaviour (from `prisma/schema.prisma`)

| Direction | From → To | onDelete |
|---|---|---|
| `ClientMembership.clientId → Client` | Cascade |
| `ClientOnboarding.clientId → Client` | Cascade |
| `ClientMailboxIdentity.clientId → Client` | Cascade |
| `MailboxIdentitySecret.mailboxIdentityId → ClientMailboxIdentity` | Cascade |
| `InboundMailboxMessage.{clientId,mailboxIdentityId}` | Cascade |
| `MailboxSendReservation.{clientId,mailboxIdentityId}` | Cascade |
| `MailboxSendReservation.outboundEmailId` | SetNull |
| `Contact.clientId → Client` | Cascade |
| `Contact.importBatchId → ContactImportBatch` | SetNull |
| `ContactImportBatch.clientId → Client` | Cascade |
| `RocketReachEnrichment.{clientId,contactId}` | Cascade / SetNull |
| `ContactList.clientId → Client` | **SetNull** (handled explicitly) |
| `ContactListMember.{contactListId,contactId,clientId}` | Cascade / Cascade / Cascade |
| `SuppressionSource.clientId` | Cascade |
| `SuppressedEmail.{clientId,sourceId}` | Cascade / SetNull |
| `SuppressedDomain.{clientId,sourceId}` | Cascade / SetNull |
| `Campaign.clientId` | Cascade |
| `OutboundEmail.clientId` | Cascade; FKs to campaign/contact/staff/mailbox are SetNull |
| `OutboundProviderEvent.{clientId,outboundEmailId}` | **SetNull / SetNull** (handled explicitly) |
| `InboundReply.clientId` | Cascade; linkedOutboundEmailId SetNull |
| `UnsubscribeToken.{clientId,contactId,outboundEmailId}` | Cascade / SetNull / SetNull |
| `ReportingDailySnapshot.clientId` | Cascade |
| `ClientEmailTemplate.clientId` | Cascade |
| `ClientEmailSequence.clientId` Cascade; **contactListId Restrict** |
| `ClientEmailSequenceStep.sequenceId` Cascade; **templateId Restrict** |
| `ClientEmailSequenceEnrollment.clientId` Cascade; **contactId + contactListId Restrict** |
| `ClientEmailSequenceStepSend.clientId` Cascade; **stepId, templateId, contactId, contactListId Restrict** |
| `AuditLog.{clientId,staffUserId}` | **SetNull / SetNull** (handled explicitly) |

## Final delete order (scripts/hard-delete-test-client.ts)

Children first, parent last, inside a single Prisma `$transaction` so
that any failure rolls the whole operation back.

1. `ClientEmailSequenceStepSend` where `clientId = X`
2. `ClientEmailSequenceEnrollment` where `clientId = X`
3. `ClientEmailSequenceStep` where `sequence.clientId = X`
4. `ClientEmailSequence` where `clientId = X`
5. `ClientEmailTemplate` where `clientId = X`
6. `UnsubscribeToken` where `clientId = X`
7. `ContactListMember` where `clientId = X`
8. `ContactList` where `clientId = X`  (**client-scoped only; global lists never touched**)
9. `RocketReachEnrichment` where `clientId = X`
10. `Contact` where `clientId = X`
11. `ContactImportBatch` where `clientId = X`
12. `OutboundProviderEvent` where `clientId = X`  (explicit — FK is `SetNull`)
13. `InboundReply` where `clientId = X`
14. `MailboxSendReservation` where `clientId = X`
15. `OutboundEmail` where `clientId = X`
16. `InboundMailboxMessage` where `clientId = X`
17. `ClientMailboxIdentity` where `clientId = X`  (`MailboxIdentitySecret` cascades automatically)
18. `SuppressedEmail` where `clientId = X`
19. `SuppressedDomain` where `clientId = X`
20. `SuppressionSource` where `clientId = X`
21. `Campaign` where `clientId = X`
22. `ClientMembership` where `clientId = X`
23. `ClientOnboarding` where `clientId = X`
24. `ReportingDailySnapshot` where `clientId = X`
25. `AuditLog` where `clientId = X`  (explicit — FK is `SetNull`)
26. `Client` where `id = X AND name = 'ZZZ TEST - OD Mailbox Proof' AND status = 'ARCHIVED'`

The final `DELETE Client` must remove exactly 1 row; otherwise the
transaction is aborted.

`StaffUser`, global `ContactList`, `GlobalBrandSetting`, and any rows
owned by other clients are never touched by this script.

## Rehearsal requirement and result

**Rehearsal (transactional):**

1. The script exposes `REHEARSE=1` which runs the same 26 ordered
   deletes inside a Prisma `$transaction`, then deliberately throws a
   `RehearsalRollback` sentinel to force Postgres to roll the whole
   transaction back.
2. The script then re-runs the live dependency audit and compares it
   to the pre-rehearsal counts. If a single count differs, the script
   aborts and prints the diff.

**Result (run against prod 2026-04-23 11:18Z):**

- All 26 ordered deletes completed without a single FK violation.
- Final `Client` delete matched exactly 1 row.
- Transaction rolled back. Post-rollback audit matches the pre-rehearsal
  counts exactly. No data was changed.

Expected row counts that the real execution will remove (sum of the
explicit delete counts plus 3 cascade-deleted `MailboxIdentitySecret`
rows):

| Table | Rows deleted |
|---|---|
| InboundMailboxMessage | 77 |
| AuditLog | 37 |
| OutboundEmail | 5 |
| MailboxSendReservation | 5 |
| ClientMailboxIdentity | 4 |
| SuppressedDomain | 4 |
| MailboxIdentitySecret | 3 (cascade) |
| RocketReachEnrichment | 2 |
| Contact | 2 |
| SuppressionSource | 2 |
| SuppressedEmail | 1 |
| ClientOnboarding | 1 |
| ClientMembership | 1 |
| Client | 1 |
| **Total** | **145** |

Every other audited table is already zero and will remain zero.

## Execution commands

Load production `DATABASE_URL` into the operator session only (never
printed, never committed, never written to a file). If the Postgres
firewall blocks, add a scoped firewall rule, then remove it at the end.

```powershell
# Load DATABASE_URL via ARM / TLS 1.2 (no secrets printed)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$armToken = (az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)
$uri = "https://management.azure.com/subscriptions/87959659-a56a-4774-ac44-f96b18905ee2/resourceGroups/rg-opensdoors-outreach-prod/providers/Microsoft.Web/sites/app-opensdoors-outreach-prod/config/appsettings/list?api-version=2022-03-01"
$resp = Invoke-RestMethod -Method POST -Uri $uri -Headers @{ Authorization = "Bearer $armToken" }
$env:DATABASE_URL = $resp.properties.DATABASE_URL
Remove-Variable armToken, resp -ErrorAction SilentlyContinue

# Optional: temporary scoped firewall rule (use operator IP)
$myIp = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json").ip
az postgres flexible-server firewall-rule create `
  -g rg-opensdoors-outreach-prod `
  --name pg-opensdoors-outreach-prod-01 `
  --rule-name hard-delete-test-client-2026-04-23 `
  --start-ip-address $myIp --end-ip-address $myIp
```

Then, in the same session:

```powershell
# 1) Live audit (read-only)
$env:DRY_RUN = "1"
npm run ops:hard-delete-test-client

# 2) Transactional rehearsal (writes then rolls back)
Remove-Item Env:DRY_RUN
$env:REHEARSE = "1"
npm run ops:hard-delete-test-client

# 3) Real execution
Remove-Item Env:REHEARSE
$env:CONFIRM = "DELETE OD MAILBOX PROOF FOREVER"
npm run ops:hard-delete-test-client
```

Cleanup after execution:

```powershell
Remove-Item Env:DATABASE_URL, Env:CONFIRM, Env:REHEARSE, Env:DRY_RUN -ErrorAction SilentlyContinue
az postgres flexible-server firewall-rule delete `
  -g rg-opensdoors-outreach-prod `
  --name pg-opensdoors-outreach-prod-01 `
  --rule-name hard-delete-test-client-2026-04-23 --yes
```

## Rollback / recovery expectations

The operation runs inside a single Prisma `$transaction`. If any
statement fails, Postgres rolls the entire transaction back and the
database is unchanged.

**After a successful commit there is no in-app undo.** Recovery would
require a point-in-time restore of the Azure PostgreSQL Flexible
Server (`pg-opensdoors-outreach-prod-01`) to immediately before the
deletion, and a manual re-hydration of the client row + children —
treat the commit as permanent.

This is acceptable because:

- The client was already a test workspace that Greg explicitly
  approved for permanent removal.
- No other client references any of its rows (global-list bleed-through
  audit = 0, no `ClientMembership` shared with other clients).
- No sends, no reconnects, no suppression syncs, no imports, and no
  app settings or secrets are changed as part of the operation.

## Proof checklist (PHASE 9)

- [ ] Script exits 0 with "Hard delete complete" and `client: 1` in the
      delete counts.
- [ ] Post-delete audit in the same run reports every table as 0 and
      the Client row as non-existent.
- [ ] `https://opensdoors.bidlow.co.uk/api/health` returns
      `{ok:true, checks:{database:"ok"}}`.
- [ ] `https://app-opensdoors-outreach-prod.azurewebsites.net/api/health`
      returns the same.
- [ ] `/clients` no longer lists "ZZZ TEST - OD Mailbox Proof".
- [ ] `/clients` still lists all other clients (currently `OpensDoors`).
- [ ] `/clients/cmo2zipl90000ggo8c9j4ysfn` returns 404 / safe
      not-found page.
- [ ] Dashboard active-client count is unchanged vs. pre-delete (the
      removed client was `ARCHIVED` and was already excluded from the
      active count).
- [ ] No references to "OD Mailbox Proof" or
      `cmo2zipl90000ggo8c9j4ysfn` remain in the running app. Training
      pages, seeded data, docs, and route links are audited separately.
- [ ] Temporary Postgres firewall rule removed.
- [ ] `DATABASE_URL`, `CONFIRM`, `REHEARSE`, `DRY_RUN` cleared from the
      operator session.
