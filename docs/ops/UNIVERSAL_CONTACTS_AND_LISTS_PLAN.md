# Universal contacts and email lists — plan

Owner: Greg + OpensDoors operators
Scope: Architecture + staged migration plan for moving ODoutreach from
per-client contacts to **universal contacts reused through named email
lists**, per Greg's clarification after PR #23.
Status: **Planning only.** No schema, server, UI, or data changes happen in
this pass. Ownership and dedupe semantics change, so we need the plan
agreed before any implementation PR.

Baseline:
- Repo: `gregvisser/ODoutreach`
- Main SHA at the time of writing: `722f7f9cefa14775b0dcb1d3eed2c48a02545db1`
- Prod migration `20260420180000_contact_import_identifiers` already
  applied; first-class identifier fields
  (`linkedIn`, `mobilePhone`, `officePhone`, `location`, `city`, `country`)
  are live on `Contact`.
- `Contact.email` remains required in this pass.
- Linked doc: `docs/ops/CLIENT_WORKSPACE_MODULE_AUDIT.md` §0.0.

---

## 1. Current model (audit)

### 1.1 Contact ownership is per-client

```
Contact
  id
  clientId (required)
  email (required)
  firstName / lastName / fullName
  company / title
  linkedIn / mobilePhone / officePhone
  location / city / country
  emailDomain
  isSuppressed (cached)
  source (CSV_IMPORT | ROCKETREACH | MANUAL)
  importBatchId?
  @@unique([clientId, email])
  @@index([clientId])
```

- `Client.contacts Contact[]` — one-to-many, enforced via `clientId`.
- `ContactImportBatch.clientId` required — every import batch belongs to
  one client, and every contact created by that batch inherits that client.
- `RocketReachEnrichment.clientId` required — enrichment jobs are
  client-scoped today.

### 1.2 Constraints that assume client-scoped contacts

- `@@unique([clientId, email])` on `Contact`.
- `Client.contacts Contact[]` relation.
- `@@index([clientId])` on `Contact`.
- (Acceptable today) `@@unique([clientId, email])` on `SuppressedEmail`,
  `@@unique([clientId, domain])` on `SuppressedDomain` — suppression is
  per-client by product decision (§0.2 of the audit).

### 1.3 Import paths requiring `clientId`

- `src/server/contacts/import-csv.ts` — takes `{ clientId, fileName, csvText }`,
  creates a `ContactImportBatch` scoped to `clientId`, upserts contacts via
  the `clientId_email` compound key, then calls
  `refreshContactSuppressionFlagsForClient(clientId)`.
- `src/server/integrations/rocketreach/person-import.ts` — takes `clientId`,
  looks up existing rows by `clientId_email`, creates new rows with
  `{ clientId, ... }`, and refreshes suppression flags per client.

### 1.4 Send / suppression paths assuming one owner

- `src/server/email/send-outbound.ts` uses
  `prisma.contact.findFirst({ where: { id: contactId, clientId } })` as the
  tenant-isolation guard, then calls `evaluateSuppression(clientId, email)`.
- `src/server/queries/pilot-contact-summary.ts` counts contacts by
  `clientId`.
- `src/server/outreach/suppression-guard.ts` evaluates per `clientId`.
- `src/lib/client-contacts-readiness.ts` assumes client-owned rows in its
  KPI math.
- `src/app/(app)/clients/[clientId]/contacts/page.tsx` queries
  `Contact where clientId = :id` directly.

### 1.5 Existing list/audience/campaign/sequence

- `Campaign` model exists but only carries `{ name, status, startsAt,
  endsAt }` plus `clientId` and an `outboundEmails` relation. It has **no
  relation to Contact or any list/audience concept**.
- There is no `ContactList`, `EmailList`, `Audience`, `Sequence`, or
  `Template` model in the schema today (grep confirmed).

### 1.6 What breaks if `Contact` goes global today (nothing else changes)

1. Prisma relation `Client.contacts` must be removed or re-pointed at a
   join, breaking every query that traverses it.
2. `@@unique([clientId, email])` cannot stand — we need a global unique
   (partial on non-null email) plus a long-term plan for LinkedIn/phone
   dedupe when email goes optional.
3. Import dedupe logic (`clientId_email`) breaks in both importers.
4. `send-outbound.ts` loses its tenant isolation guard; we have to
   introduce a list/campaign/sequence link to re-establish "this client is
   allowed to send to this contact right now".
5. Readiness and pilot queries stop returning per-client counts. They need
   to be recomputed over "contacts on lists linked to this client".
6. Suppression refresh needs a new traversal — "all contacts reachable from
   this client through list membership" instead of "all contacts where
   `clientId = :id`".
7. Data risk: a surprise unification could surface client A's contacts
   inside client B before list membership is backfilled. This must be
   gated behind a backfill and an explicit switch.

Conclusion: **a one-shot universal-contact migration is unsafe**. We need
a bridge model that keeps `Contact.clientId` while we grow a list layer
around it.

---

## 2. Target model

### 2.1 Universal Contact / Prospect

One canonical row per real-world person. Owns the intake shape we already
store in `Contact`:

- `fullName`, `firstName`, `lastName`
- `company`, `title`
- `email` (required today, optional in a later PR)
- `linkedIn`, `mobilePhone`, `officePhone`
- `location`, `city`, `country`
- `source` (CSV_IMPORT / ROCKETREACH / MANUAL), `importBatchId`
- `emailDomain`, timestamps

Dedupe:
- Today: by email (partial unique index once `email` becomes optional).
- Later: by LinkedIn URL and E.164 phone once email is optional (separate
  PR; almost certainly needs an explicit merge UI for collisions).

### 2.2 Contact List / Email List / Audience

Named reusable group of contacts, created by an operator.

- `name` (e.g. "Manchester Finance Directors — April 2026")
- `description?`
- `clientId?` (nullable — list can be client-scoped or global; see open
  decisions)
- `createdById?` (StaffUser)
- timestamps
- `members: ContactListMember[]`

### 2.3 Contact list membership (join table)

- `contactListId + contactId` unique.
- `addedAt`, `addedById`.
- Allows a contact to appear in many lists. Lets us build "lists attached
  to client X" without duplicating contact rows per client.

### 2.4 Client ↔ list linkage

Two candidate shapes (decide before `PR D1`):

- **A.** `ContactList.clientId` nullable; a list belongs to zero or one
  client. Simpler and matches current tenant-isolation habits.
- **B.** Separate `ContactListClient` join (many-to-many). Lets one list
  serve several clients, e.g. a shared "Manchester Finance Directors"
  list used across sister campaigns.

Recommendation: **start with A** (nullable `ContactList.clientId`) to keep
the migration shallow. Upgrade to B in a later PR if and when Greg wants a
single list to drive multiple clients.

### 2.5 Sequence targeting

- A sequence points at exactly one list (`contactListId`).
- At send time the sequence materializes into OutboundEmail rows filtered
  by:
  1. list membership (`ContactListMember`)
  2. `email-sendable` (not suppressed + has email)
  3. the sequence's sending client's suppression list (`SuppressedEmail` /
     `SuppressedDomain`)
- Suppression stays **per client** at send time. A contact that is
  suppressed for client A can still be sent to on behalf of client B
  unless/until global suppression is introduced.

### 2.6 Backwards-compat bridge

While both models coexist:
- `Contact.clientId` stays required.
- A client's "contacts" surface becomes **"lists linked to this client"**
  + the contacts reachable through them.
- For historical client-owned contacts, create one default system list per
  client (e.g. "Legacy — <client name>") and backfill `ContactListMember`
  rows, so the client Contacts page can continue to render the same
  readiness counts without depending on `Contact.clientId` directly.
- Only after that backfill is in place is it safe to drop `Contact.clientId`.

---

## 3. Migration risks

1. **Tenant-isolation regression.** Until every server entry point (send,
   suppression, readiness, pilot) has been rewritten to traverse list
   membership, any code path that still trusts `Contact.clientId` must keep
   working. Keeping `Contact.clientId` required through `PR D4` is the
   cheapest safety net.
2. **Uniqueness redesign.** Global `Contact.email` dedupe changes the
   failure mode of CSV imports — today two different clients can import
   the same email without colliding; in a universal world the second
   import must update-or-attach, not error out. This must be spec'd before
   `PR D2` ships.
3. **Suppression semantics drift.** Operators may assume that suppressing
   a contact for one client suppresses them everywhere. Product copy must
   make per-client suppression obvious the moment lists are visible.
4. **Historical RocketReach links.** `RocketReachEnrichment.contactId`
   is unique; that keeps working even if `Contact` goes universal. But
   `RocketReachEnrichment.clientId` remains — decide whether enrichment
   jobs remain client-scoped (probably yes: they map to a client's API
   quota / search context) even when the contacts they produce are
   universal.
5. **Backfill correctness.** Every contact currently in the DB has a
   `clientId`. The default list per client must include them exactly once,
   and the backfill must be idempotent (re-runnable).
6. **UI ambiguity in the bridge phase.** Between `PR D1` and `PR D3`, the
   Contacts page still shows a per-client view. Copy must call it "Lists
   for this client" rather than "This client's contacts" to prevent
   operator confusion.
7. **Migration ordering in production.** `prisma migrate deploy` is still
   a manual step on prod (see `docs/DEPLOYMENT_CHECKLIST.md`). Any `PR D`
   that ships schema changes must include an explicit prod-migration
   playbook.

---

## 4. Proposed Prisma models (sketch, not implemented)

> The sketch below is **indicative**. It is not applied to
> `prisma/schema.prisma` in this PR. Fields/relations are final only after
> Greg signs off on the open decisions in §7.

```prisma
model ContactList {
  id          String   @id @default(cuid())
  name        String
  description String?
  clientId    String?  // Option A: nullable single-client link
  client      Client?  @relation(fields: [clientId], references: [id], onDelete: SetNull)
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  members     ContactListMember[]

  @@index([clientId])
  @@index([name])
}

model ContactListMember {
  id            String   @id @default(cuid())
  contactListId String
  contactId     String
  addedAt       DateTime @default(now())
  addedById     String?

  contactList ContactList @relation(fields: [contactListId], references: [id], onDelete: Cascade)
  contact     Contact     @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([contactListId, contactId])
  @@index([contactId])
}
```

Bridge compatibility:
- `Contact.clientId` stays required until `PR D5`. `ContactList` is
  additive — nothing in the current query graph has to change until we
  start *using* it.

Later (not in this sketch, captured for context):
- `Sequence { id, clientId, contactListId, ...approval fields }`
- `Template { id, clientId, category, subject, content, status }`

---

## 5. Staged PR sequence

Every PR stays safe by default: no sends, no imports, no suppression syncs,
no mailbox/OAuth changes, no app-setting changes, no destructive
migrations. Schema changes are additive or safe relaxations only, and
Greg explicitly approves each step before it runs.

### PR D0 — Plan (this PR)
- **Docs-only.** This document + the §0.0 update in the module audit.
- No schema change, no server change, no UI change.
- Gates: `npm run lint` (docs shouldn't affect lint, but run anyway),
  `npm run test`, `npm run build`. No `prisma migrate`.

### PR D1 — Additive list models
- Add `ContactList` and `ContactListMember`. Option A linkage (single
  nullable `clientId` on `ContactList`).
- Keep `Contact.clientId` required, keep `@@unique([clientId, email])`.
- Migration is additive (two new tables + one nullable FK). Zero data
  movement. No backfill yet.
- UI: **none.** Models exist but nothing renders them.
- Exit criteria: Prisma Studio can see the empty tables; CI + prod
  migration playbook rehearsed.

### PR D2 — Named list at import time
- CSV and RocketReach import forms accept an optional "Save to list" name
  (create-or-reuse).
- On import, after the existing Contact upsert, add the contact to the
  chosen `ContactList` via `ContactListMember` (idempotent).
- Still writes `Contact.clientId` exactly as today. No change to
  send/suppression.
- UI: small input + list picker on Sources and global Contacts.
- Exit criteria: an operator can import a CSV, tag it "Manchester Finance
  Directors — April 2026", and see the list + member count in a read-only
  panel.

### PR D3 — Client Contacts tab becomes "Client lists"
- `/clients/[id]/contacts` re-skins to show **lists linked to this client**
  (via `ContactList.clientId`) plus per-list readiness counts.
- Keeps the current KPI strip (total / valid / email-sendable / suppressed
  / missing-email / missing-outreach-identifier) but computes it over "all
  contacts on lists linked to this client", deduping by `Contact.id`.
- Global `/contacts` remains the universal library view (already cross-
  client today).
- No schema change.

### PR D4 — Sequence foundation
- Add `Template` and `Sequence` models (per §0.5 of the audit).
- `Sequence` targets one `ContactList`.
- OpensDoors approval lives on templates/sequences.
- **No sending yet.** Sending integration is PR G (outreach gating) and
  inherits the full 12-item §0.6 checklist.

### PR D5 — Universalize `Contact`
- Only after `PR D1`..`PR D3` have been live and stable.
- Backfill: create one default system `ContactList` per client with all
  existing `Contact` rows as members; verify counts match.
- Drop `Client.contacts` relation and `Contact.clientId` column in a
  carefully sequenced migration:
  1. Add new global uniqueness (partial unique on non-null email).
  2. Rewrite every query / API route to traverse list membership.
  3. Keep `clientId` as a nullable shadow for one release.
  4. Drop `clientId` in a follow-up release once telemetry confirms no
     code paths read it.
- Email-optional persistence can ride alongside or follow this PR
  depending on Greg's priority.

---

## 6. Safety constraints (carry-forward)

- Do not send emails.
- Do not submit pilot sends.
- Do not run RocketReach or CSV imports.
- Do not run suppression sync.
- Do not change app settings, OAuth, or mailbox send execution logic.
- Do not drop or rename `Contact.clientId` until `PR D5`.
- Do not make `Contact.email` nullable in `PR D0..D4`.
- Do not implement sequences, templates, or outreach gating before the
  list layer is in place.
- Ignore the untracked `scripts/apply-google-sa-appsetting.ps1`.

---

## 7. Open decisions still needed from Greg

1. **List ↔ client cardinality.** Start with "a list belongs to zero or
   one client" (Option A) — or do we need many clients per list from day
   one (Option B)?
2. **Import workflow ergonomics.** When an operator imports a CSV, should
   "save to list" be required, optional with a default, or allowed as a
   second step after import?
3. **Global suppression.** Is a universal suppression list (applied across
   every client) a near-term need, or do we continue with per-client
   suppression through sequences + send-time evaluation?
4. **Email-optional persistence.** When do we land it? Before `PR D5`
   (so the universalized `Contact` lands with optional email in one shot)
   or after (so the universalization migration is smaller)?
5. **LinkedIn / phone dedupe.** When email becomes optional, what is the
   tie-breaker for rows that only have LinkedIn or phone? Options:
   partial unique index per identifier, canonical identity chosen at
   import time, or an explicit merge UI.
6. **Governance of cross-client reuse.** Does OpensDoors want a review
   step before an operator can attach a list that was originally built
   for client A to a sequence for client B?
7. **Legacy naming.** During the bridge phase, what do we call a
   default-per-client list? Proposed: "Legacy contacts — <client name>".
   Any preference for wording / prefix so operators don't treat it as an
   active list?

---

## 8. One-paragraph conclusion

The current `Contact` model is tightly coupled to `clientId` through a
unique constraint, relations, indexes, and every import / send / readiness
/ suppression path; a one-shot universalization is unsafe. The safe path
is to land `ContactList` + `ContactListMember` additively (`PR D1`),
teach imports to attach to named lists (`PR D2`), re-skin the client
Contacts tab to show lists instead of ownership (`PR D3`), build the
sequence/template layer on top of lists (`PR D4`), and only then drop
`Contact.clientId` with a rehearsed backfill (`PR D5`). `PR C2` (import
preview counts) stays paused until `PR D2` lands, because surfacing per-
row counts against a client-scoped contact pool reinforces the exact
ownership story we are trying to replace.
