# ODoutreach — Test client retirement: "OD Mailbox Proof"

Date: 2026-04-23
Target clientId: `cmo2zipl90000ggo8c9j4ysfn`
Target name (pre-change): `OD Mailbox Proof`
Action implemented: **soft retirement only** (rename to `ZZZ TEST - OD Mailbox Proof` + status `ARCHIVED`). **No hard deletion.**

---

## Why we retire (and did not hard delete)

`OD Mailbox Proof` is a production-located test client used across many
earlier proof flows. The mission was to remove it from active operational
use safely and, if explicitly proven safe, hard-delete it.

Static dependency analysis against `prisma/schema.prisma` shows that a
`DELETE FROM "Client" WHERE id = ...` would rely on PostgreSQL cascading
through a large fan-out including models with mixed delete policies:

| Model                                 | Relation to `Client` | On delete  | Notes |
| ------------------------------------- | -------------------- | ---------- | ----- |
| `ClientMembership`                    | direct               | Cascade    | safe |
| `ClientOnboarding`                    | direct               | Cascade    | safe |
| `ClientMailboxIdentity`               | direct               | Cascade    | cascades to `MailboxIdentitySecret`, `InboundMailboxMessage`, `MailboxSendReservation`, `OutboundEmail.mailboxIdentityId` (SetNull) |
| `InboundMailboxMessage`               | direct + via mailbox | Cascade    | safe |
| `MailboxSendReservation`              | direct + via mailbox | Cascade    | safe |
| `Contact`                             | direct               | Cascade    | Contact has `Restrict` FKs inbound from `ClientEmailSequenceEnrollment.contact` and `ClientEmailSequenceStepSend.contact` — these must be cleared first |
| `ContactImportBatch`                  | direct               | Cascade    | safe |
| `RocketReachEnrichment`               | direct               | Cascade    | safe |
| `ContactList`                         | direct               | **SetNull** | ⚠ client-scoped lists owned by this client would become `clientId = null` (global) rather than being removed |
| `ContactListMember`                   | direct               | Cascade    | safe |
| `SuppressionSource`                   | direct               | Cascade    | safe |
| `SuppressedEmail`                     | direct               | Cascade    | safe |
| `SuppressedDomain`                    | direct               | Cascade    | safe |
| `UnsubscribeToken`                    | direct               | Cascade    | safe |
| `Campaign`                            | direct               | Cascade    | safe |
| `OutboundEmail`                       | direct               | Cascade    | safe; cascades to `OutboundProviderEvent` (SetNull), `ClientEmailSequenceStepSend.outboundEmailId` (SetNull), `UnsubscribeToken.outboundEmailId` (SetNull) |
| `OutboundProviderEvent`               | direct               | **SetNull** | acceptable — audit history preserved with `clientId = null` |
| `InboundReply`                        | direct               | Cascade    | safe |
| `ReportingDailySnapshot`              | direct               | Cascade    | safe |
| `AuditLog`                            | direct               | **SetNull** | acceptable — audit history preserved with `clientId = null` |
| `ClientEmailTemplate`                 | direct               | Cascade    | template has `Restrict` FKs from `ClientEmailSequenceStep.template` and `ClientEmailSequenceStepSend.template` — must be cleared first |
| `ClientEmailSequence`                 | direct               | Cascade    | cascades to `ClientEmailSequenceStep` (cascade), `ClientEmailSequenceEnrollment` (cascade), `ClientEmailSequenceStepSend` (cascade) |
| `ClientEmailSequenceStep`             | via sequence         | Cascade    | has `Restrict` FK from `ClientEmailSequenceStepSend.step` |
| `ClientEmailSequenceEnrollment`       | direct               | Cascade    | has `Restrict` FKs to `Contact` and `ContactList` |
| `ClientEmailSequenceStepSend`         | direct               | Cascade    | has `Restrict` FKs to `ClientEmailSequenceStep`, `ClientEmailTemplate`, `Contact`, `ContactList` |

### Blockers to hard delete (without a live production audit)

1. **`ContactList` uses `onDelete: SetNull`.** If the target client owns
   any client-scoped `ContactList` rows, deleting `Client` would reparent
   them to global visibility (`clientId = null`) rather than remove them.
   That would expose test data across tenants. Static analysis cannot
   tell us whether such rows exist.
2. **Multiple `onDelete: Restrict` FKs are simultaneously in play.**
   `Contact`, `ContactList`, `ClientEmailTemplate`, and
   `ClientEmailSequenceStep` all have inbound `Restrict` FKs from
   sequence- and step-send-scoped tables. In principle PostgreSQL resolves
   cascade order transactionally so the `Cascade` sibling rows are
   deleted first, but the exact evaluation order is not formally
   guaranteed and there is no test coverage proving a clean teardown in
   this schema. A single surprise row (e.g. an orphan step-send) would
   abort the entire delete.
3. **Audit history on `AuditLog` and `OutboundProviderEvent` becomes
   tenant-orphaned** (`clientId = null`). That's acceptable for retention
   but means the "delete" is not actually a full wipe — the row count
   remains the same. A pure retirement (archive) achieves the same
   operational outcome with zero risk to audit trails.

Given (1) and (2), **hard delete is not proven safe from static analysis
alone.** The operational goal — remove the client from active use — is
fully achieved by soft retirement:

- `status = ARCHIVED` prevents launch approval and marks the workspace
  read-only in the UI (`status-labels.ts`, `clients/[clientId]/page.tsx`:
  "Archived — read-only. No new outreach will be sent from this
  workspace.")
- Renaming to `ZZZ TEST - OD Mailbox Proof` makes the retired row
  visually obvious and sorts it to the bottom of the client list.
- The archive is fully reversible if needed.

---

## What the script does

`scripts/retire-test-client.ts`:

1. Loads the target client and enumerates per-model dependency counts.
2. Refuses to run against any `CLIENT_ID` other than
   `cmo2zipl90000ggo8c9j4ysfn`.
3. In `DRY_RUN=1` mode: prints the audit and exits without writes.
4. Otherwise requires `CONFIRM="RETIRE OD MAILBOX PROOF"` and then, in a
   single transaction, updates the client (`name`, `status`) and writes
   an `AuditLog` row that captures the previous name, the new name, and
   the confirmation token.
5. Is idempotent: re-runs no-op if the client is already archived and
   renamed.
6. **Does not** send email, submit replies, import contacts, sync
   suppression, reconnect OAuth, change app settings, or rotate secrets.

### Usage

```bash
# Dry-run audit (no writes)
DRY_RUN=1 npm run ops:retire-test-client

# Perform soft retirement
CONFIRM="RETIRE OD MAILBOX PROOF" npm run ops:retire-test-client
```

`DATABASE_URL` must be set in the environment. The script uses the same
Prisma client as the app (`src/lib/db.ts`).

---

## If a future hard delete is requested

Before it can be considered safe, the following must be proven against
the live database:

1. `SELECT COUNT(*) FROM "ContactList" WHERE "clientId" = '...'` = 0,
   or a decision to explicitly delete each owned list first.
2. Every `ClientEmailSequenceStepSend` row for the client has already
   been either purged or linked to a terminal state (there are none at
   retirement time — the D4e.2+ dispatcher is still gated and this
   client will never send again once `ARCHIVED`).
3. A rehearsal delete executed inside a `ROLLBACK`-wrapped transaction
   on a production snapshot has succeeded without `Restrict` violations.

Until those are documented and signed off, retention of the retired row
is strictly preferable to an irreversible delete.
