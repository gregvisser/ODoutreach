# Client workspace module audit

Owner: Greg + OpensDoors operators
Scope: UI/UX + product ownership audit of the client workspace modules — Overview,
Brief, Mailboxes, Sources, Contacts, Suppression, Outreach, Activity.
Status: Audit only (no implementation). This doc exists to force product decisions
before another UI pass.

Baseline:
- Repo: `gregvisser/ODoutreach`
- Main SHA before this audit: `7de98905ca857c9e0455df12feeea886f1597779`
- Proof URL: https://opensdoors.bidlow.co.uk/clients/cmo2zipl90000ggo8c9j4ysfn

---

## 0. Greg decisions captured

This section records Greg's product decisions from the post-audit review. The
remaining sections below have been updated to reflect these decisions, but this
is the authoritative summary. Any question in §7 that is answered here is
marked **Answered**.

### 0.0 Universal contacts and email lists decision (post-PR #23)

Greg clarified that imported contacts are **not** owned by a single client.
This supersedes the implicit ownership assumption in §0.1, §5 and §5b and
reshapes the post-PR #23 roadmap.

- **Contacts imported via CSV and RocketReach are universal** — one canonical
  row per real-world prospect. An imported contact may be used for any client.
- **Email lists / audiences are the reusable unit.** Operators create a named
  list (e.g. "Manchester Finance Directors — April 2026"), add contacts to it,
  and a list can be reused across clients.
- **Client association happens through lists, campaigns, and sequences**, not
  by owning the `Contact` row directly.
- **Sequences send to a selected named list.** At send time the app filters
  the list down to email-sendable contacts and applies the client's
  suppression.
- **A contact can appear in many lists**, and a list can be linked to one or
  more clients (final multi-client-per-list semantics TBD; see §0.0 open
  decisions below).
- **Suppression stays per-client** at send/readiness time. A contact that is
  suppressed for client A is not deleted from the universal pool; it simply
  cannot be sent to on behalf of client A. Global suppression is a possible
  later concept but is **not** required in this phase.
- **The current PR #22 client-scoped Contacts page remains useful short-term**
  as a readiness/eligibility view, but its naming and ownership story must be
  corrected in a later PR — it should become a "lists attached to this client"
  view, not a "contacts owned by this client" view.

Consequences for the PR plan:

- The **import-preview** slice that was informally called "PR C2" (surface
  per-row validity / email-sendable counts during preview) is **paused**. It
  is still useful, but it is no longer the next highest-value slice, because
  importing to a per-client `Contact.clientId` pool reinforces the wrong
  ownership model.
- The next value-add is the **universal contact pool + named list** concept
  (detailed in §6 and in `docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md`).
- Any new behavior must continue to respect the safety rules at the top of
  `AGENTS.md` / `CLAUDE.md` — no sends, no imports, no suppression syncs, no
  destructive migrations in an audit/planning pass.

**Open decisions still needed from Greg** (carry-over for the plan doc):
- Can a single list be linked to multiple clients, or exactly one?
- When an operator imports a CSV, should attaching contacts to a named list
  be required at import time or allowed as a second step?
- Is global suppression a near-term need, or is per-client suppression
  sufficient through the sequence/send layer?
- When `Contact.email` eventually becomes optional, how do we dedupe rows
  that only have LinkedIn or phone? (Partial unique index per identifier,
  canonical identity choice, or explicit merge UI?)

### 0.1 Contacts — intake shape and validity

- **CSV and RocketReach imports must accept these headings (any may be empty):**
  `Name`, `Employer`, `Title`, `First Name`, `Last Name`, `Location`, `City`,
  `Country`, `LinkedIn`, `Job1 Title`, `A Emails`, `Mobile Phone Number`,
  `Office Number`.
- **Valid contact rule:** a contact is valid only if at least one of
  `Email`, `LinkedIn`, `Mobile Phone Number`, `Office Number` is present **and**
  the contact is not suppressed.
- **Email-sendable contact rule (refinement):** a valid contact that also has
  an email address. Pilot email sends require email-sendable contacts.
- **Manual approval:** do **not** add a manual per-contact approval step yet
  unless the existing contact model already supports an approval flag cleanly.
  OpensDoors approval is applied at the **template / sequence** level, not per
  contact.
- **Client-scoped Contacts route:** yes — stop the redirect. Render a real
  client-scoped workspace page.

### 0.2 Suppression — ownership

- Suppression is **owned by OpensDoors**. Bidlow and OpensDoors manage
  suppression together.
- Suppression sync remains **manual for now** (no scheduled sync in this
  phase).

### 0.3 Mailboxes — capacity

- 5 connected mailboxes is **recommended, not mandatory**.
- Capacity formula stays simple for now:
  `connected sending mailboxes × 30 / day`.

### 0.4 Brief / onboarding — form shape

The brief is **both an editable form and a readable operating brief**. The
required sections and fields are:

**Client profile**
- Client Name
- Client Website
- Client History
- Client Profile
- Client Sector (reusable dropdown option)
- Client Head Office Address (searchable by address / postcode)
- Social Media Presence (selectable platforms with linked pages)

**Commercial / account**
- Monthly Revenue from Client (£)
- Customer Agreement attachment
- Assigned Account Manager (linked to a user)

**Client contacts** (the client's own contact roster, not outreach targets)
- Contact Name
- Contact Surname
- Contact Email Address
- Contact Mobile Number
- Contact Landline Number
- Contact Status (active / inactive)
- Role at Company / Client
- "Add more contacts" button

**Campaign strategy**
- Key Business Objectives
- Qualifying Questions
- Client USPs
- Target Geographical Area (multiple searchable locations)
- Target Job Sector (reusable dropdown option)
- Target Job Roles (reusable dropdown option)

**Documents**
- Accreditations attachment (PDF / Word / PPT)
- Customer Agreement attachment (PDF / Word / PPT)

**Compliance / suppression**
- Suppression email list linked to client account
- Suppression domain list linked to client account

**Outreach setup**
- Connect email addresses for outreach
- Recommended mailbox target is 5 but not blocking

**Operations sign-off**
- Operations Sign Off checkbox
- When operations signs off, username and timestamp must be displayed

### 0.5 Templates & sequences

- Each client has **different templates**.
- **Templates must be created before sequences.**
- **Sequences must exist (with templates) before sending from imported
  contacts.**
- **OpensDoors approves messages / templates loaded per client.**

**Template fields:**
- Template Name
- Category (one of): `Introduction email`, `Follow-up 1`, `Follow-up 2`,
  `Follow-up 3`, `Follow-up 4`, `Follow-up 5`
- Email Subject
- Email Content
- Status (one of): `Draft`, `Ready for review`, `Approved`, `Archived`

**Sequence fields (recommended):**
- Sequence Name
- Client
- Ordered template steps
- Delay between follow-ups
- Active / inactive
- Approved by OpensDoors
- Approved-at timestamp

**Supported placeholders:**

Target recipient / company:
- `{{first_name}}`, `{{last_name}}`, `{{full_name}}`
- `{{company_name}}` — the **target company**, not the OpensDoors client
- `{{role}}`, `{{website}}`, `{{email}}`, `{{phone}}`

Sender / client:
- `{{sender_name}}`, `{{sender_email}}`
- `{{sender_company_name}}` — the **sending client organization**
- `{{email_signature}}`, `{{unsubscribe_link}}`

Important distinction: `{{sender_company_name}}` is the sending client org;
`{{company_name}}` is the target company. CamelCase aliases (e.g.
`firstName`) can continue to work, but the UI should prefer snake_case.

### 0.6 Outreach — pilot gating

Pilot sending must be gated by **all** of the following, in order:

1. Brief required fields complete.
2. Operations sign-off complete (user + timestamp).
3. At least 1 connected sending mailbox.
4. At least 1 email-sendable contact (valid + has email + not suppressed).
5. Suppression configured (email and/or domain list linked).
6. Suppression manually synced (operator-triggered, not automatic).
7. At least 1 **approved** introduction template for the client.
8. A sequence exists that uses approved templates.
9. Sequence is **approved by OpensDoors**.
10. Preview renders successfully with placeholders resolved.
11. Send capacity available (mailbox pool × 30/day not exhausted).
12. Explicit confirmation typed before send (current `SEND PILOT` pattern).

### 0.7 Activity — shape

- Activity is **timeline-first**; filters come later.
- Priority event types, in order:
  1. Sends
  2. Replies
  3. Bounces
  4. Errors
  5. Syncs (suppression, inbox)
  6. Imports (CSV, RocketReach)
  7. OAuth connect / disconnect
  8. Audit (brief edits, sign-off, approval changes)

---

## 1. Route and component inventory

Client workspace layout wraps every child route:

- `src/app/(app)/clients/[clientId]/layout.tsx` — wraps children with
  `ClientWorkspaceSubnav` (Overview | Brief | Mailboxes | Sources | Contacts |
  Suppression | Outreach | Activity) inside `mx-auto max-w-6xl space-y-8`.
- `src/components/clients/client-workspace-subnav.tsx` — the tab bar.

### Per-route inventory

| Route                                         | Main components                                                                 | Primary job                                                              | Main actions                                                          | Status/metrics shown                                                    | Overlap risk                                                                 | Responsive concerns                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/clients/[id]` (Overview)                    | `ClientWorkspaceCommandCenter`, `ClientWorkflowStrip`, `LaunchReadinessPanel`, `TonightLaunchChecklist` (collapsed), `ClientOperationalSnapshot` | Command center: can this client launch, and where do I go next?          | Navigate to any module via readiness rows / workflow pills            | Launch stage, 7 module readiness rows + metrics, 4 KPI tiles, ~14 technical checks | Workflow pills + readiness rows both list the same 7 modules with status     | OK after PR #20; workflow pills can still feel duplicative of readiness |
| `/clients/[id]/brief`                         | `OpensDoorsBriefGuidedForm`, Brief readiness aside card, Next modules aside     | Capture operating brief (single source of client context)                | Fill/save brief form; jump to next modules                            | `% complete`, completed/total count, missing-fields list, next module list | Brief % also appears in Overview readiness + workflow step                   | `lg:grid-cols-[minmax(0,1fr)_320px]` sticky aside — collapses fine      |
| `/clients/[id]/mailboxes`                     | `SenderReadinessPanel`, `ClientMailboxIdentitiesPanel`                          | Connect up to 5 outreach senders + show identity/allowlist state         | OAuth connect/reconnect, remove, check OAuth banner                   | Configured vs verified vs allowlisted; per-mailbox connection + send readiness; pool cap | Sending count / capacity also in Overview readiness + Operational snapshot   | Two heavy cards stack fine on mobile; mailbox rows are dense on narrow |
| `/clients/[id]/sources`                       | `RocketReachImportPanel`                                                        | Configure + trigger RocketReach imports (enrichment pipeline)            | Simple-search import, raw-JSON import (each run ≤ 10 contacts)        | `ROCKETREACH_API_KEY` ready flag, last-import message                    | Overlaps Contacts (imports land there); “ready” flag also in Overview readiness | Form is reasonable; no mobile-specific issues                          |
| `/clients/[id]/contacts` (**redirect**)       | — redirects to `/contacts?client={id}`                                          | Delegate to global cross-client directory filtered by this client        | CSV import, send-to-contact, filter by client                         | Contacts table (global UI)                                               | Not a true client-scoped page — global UI shows other clients’ filter chips | Global page uses `max-w-7xl`, subnav `max-w-6xl` — content jumps width |
| `/clients/[id]/suppression`                   | `ClientSuppressionInlineCard`                                                   | Wire Google Sheets suppression sources and show sync state               | Add/edit Sheet URL+range, trigger sync (if allowed), surface SA email | Service account configured flag, per-source syncStatus + lastSyncedAt + lastError | Overlaps Overview readiness; global `/suppression` also exists               | Single card, stacks OK                                                 |
| `/clients/[id]/outreach`                      | `GovernedTestSendPanel`, `ControlledPilotSendPanel`                             | Send one governed proof email OR queue a small pilot via mailbox pool    | Queue test send; type `SEND PILOT` + queue pilot (up to hard cap)     | Pilot prereqs, pool remaining capacity, contact eligibility              | Prerequisites duplicate Overview readiness (brief/mailboxes/contacts)        | Two stacked cards; pilot form is wide on desktop                       |
| `/clients/[id]/activity`                      | `RecentGovernedSendsPanel`, `ClientMailboxInboxPanel`                           | Ledger + inbox preview for this client                                   | View recent governed sends; sync/preview inbox                        | Governed send rows (status, UTC window), inbox messages per mailbox     | Global `/activity` covers cross-client timeline                              | Two stacked cards; inbox rows can be wide                              |

> Note: the client-scoped Contacts tab is a redirect. It works, but operators land
> on the **global** contacts page with every client’s filter chip visible. This
> is the single most jarring break in the workspace flow.

### Supporting modules

- `src/lib/client-launch-state.ts` — builds:
  - `buildClientWorkflowSteps` → 7-step strip used in Overview command center.
  - `buildLaunchReadinessRows` → 7-row panel used in Overview.
  - `deriveLaunchStageLabel` → banner pill (e.g. “Pilot-ready”, “In setup”).
- `src/server/queries/client-workspace-bundle.ts` (`loadClientWorkspaceBundle`) —
  the single bundle used by every page in the workspace.
- `src/components/clients/client-workspace-command-center.tsx` — header +
  workflow strip (lightweight since PR #20).
- `src/components/clients/client-operational-snapshot.tsx` — 4-KPI grid on
  Overview (status, sending mailboxes, eligible contacts, latest activity).
- `src/components/clients/launch-readiness-panel.tsx` — 7 rows + collapsed
  technical checks (`<details>`).
- `src/components/clients/tonight-launch-checklist.tsx` — ~14 operator-level
  checks (env keys, mailbox paths, pool capacity, etc.). Lives inside the
  collapsed Overview disclosure.

---

## 2. Duplication / confusion map

The workspace currently tells the operator the same facts in 3–4 places.

| Fact                                     | Overview workflow pill | Overview readiness row  | Overview snapshot tile | Module page              | Overview technical checks |
| ---------------------------------------- | ---------------------- | ----------------------- | ---------------------- | ------------------------ | ------------------------- |
| Brief % complete / empty                 | ✓ pill + `x/y fields`  | ✓ pill + `%`            | —                      | ✓ form + aside card      | ✓ one check               |
| Connected sending mailbox count / cap    | ✓ `N/5 sending`        | ✓ `N connected · d/day` | ✓ `N/5 — d/day`        | ✓ identities panel       | ✓ 3 related checks        |
| RocketReach API key ready                | ✓ status               | ✓ “Sources ready / API missing” | —              | ✓ banner                 | ✓ one check               |
| Suppression Sheet count / Google API     | ✓ `N Sheet source(s)`  | ✓ sync state            | —                      | ✓ sources table          | ✓ two checks              |
| Contacts total / eligible / suppressed   | ✓ metric               | ✓ metric                | ✓ tile                 | ✓ global contacts table  | ✓ one check               |
| Pilot runnable / prereqs                 | ✓ step                 | ✓ row                   | —                      | ✓ prereqs panel + form   | ✓ 2 checks                |
| Latest governed activity                 | ✓ step `metric`        | ✓ “monitoring”          | ✓ tile                 | ✓ ledger                 | —                         |
| Client status (ACTIVE/…)                 | —                      | —                       | ✓ tile                 | —                        | ✓ one check               |

Signals:
- **Workflow strip and readiness rows teach the same 7-module map** at different
  densities. After PR #20 the strip is lighter, but they still say the same
  thing. The strip now earns its keep only as quick in-page navigation.
- **Overview snapshot vs readiness row** for mailboxes/contacts/activity are
  near-duplicates; only `Client status` is genuinely new data.
- **Technical checks** still re-state things already visible in the readiness
  rows (brief, suppression, capacity, pilot). It’s fine as a diagnostic
  disclosure, but it is not a distinct product surface.
- **Contacts redirect** makes the workspace feel bolted on — a user filtering
  contacts inside a client workspace still sees every other client’s filter
  chip.
- **Global sidebar vs client subnav**: `Contacts`, `Suppression`, `Activity`,
  `Operations` exist both globally and per-client. Operators can arrive at the
  same record from 2–3 different breadcrumbs, which is the “bolted-on tools”
  feeling Greg described.

---

## 3. Confusion findings (operator-side)

1. **“Where do I land?”** Overview header + workflow strip + readiness panel all
   compete for primary focus. After PR #20 this is tolerable, but the strip and
   rows still answer the same question.
2. **“Which button is dangerous?”** Outreach has two send panels; the Governed
   test and the Controlled pilot both live on the same route. Pilot has a
   `SEND PILOT` confirmation string; Governed test has lighter guards. A first
   glance does not make the blast radius obvious.
3. **“Who owns suppression?”** Client subnav has it, global sidebar has it,
   Overview readiness has it. The current copy (“Google Sheets suppression
   sources and sync”) doesn’t say whether the source-of-truth is Greg’s master
   list or the client’s list — and the module pages don’t enforce that model.
4. **“How do I add contacts?”** The Contacts tab redirects to a global URL with
   a filter. The RocketReach panel lives on Sources, and CSV import lives on
   global Contacts. Two import paths; no single contact-intake story.
5. **“Did my sync actually work?”** Suppression shows `syncStatus` and
   `lastError`, but the sync trigger lives inside the inline card, so operators
   who only look at Activity miss sync failures. Activity shows governed sends
   and inbox only — not syncs, imports, or webhooks.
6. **“Is this client ready?”** Three places currently answer this:
   - Launch readiness panel (7 rows)
   - Overview snapshot (4 tiles)
   - Workflow strip (7 pills)
   Only the first is authoritative. Others should be subordinate or re-purposed.

---

## 4. Responsive findings (mobile / tablet / desktop)

Tested from code + PR #20 proofs at 390 / 768 / 1440.

Mobile (390px):
- Subnav wraps to 2 rows of 4 pills — tolerable but starts to feel like a
  “nav ribbon on a nav ribbon” next to the global sidebar’s mobile state.
- Mailboxes page: `ClientMailboxIdentitiesPanel` + `SenderReadinessPanel`
  stack as two tall cards; per-row OAuth buttons are cramped.
- Outreach page: pilot prereqs summary can overflow on narrow screens (long
  metric strings in a flex row).
- Brief page: main form + aside collapse to a single column — aside `sticky`
  drops (expected). Readable.
- Activity page: inbox rows have long subject lines; `truncate` needed.

Tablet (768px):
- Generally works; `lg:grid-cols-…` only kicks in at 1024px so 768 stays in
  mobile-stack mode for Brief, Mailboxes, Outreach. This is fine but tablet
  users see the “mobile stack” longer than they might expect for a workspace.

Desktop (1440px):
- Subnav + content inside `max-w-6xl`; the global Contacts page uses
  `max-w-7xl`. Redirecting from client Contacts → global Contacts therefore
  visibly widens the page, which reinforces the bolted-on feeling.
- Overview hierarchy is clean (PR #20). Brief aside is good. Mailboxes could
  use a two-column identities grid on wide screens.

---

## 5. Proposed ownership model

Each module should answer exactly one operator question and own exactly one
primary artifact.

| Module      | Single question it answers                                              | Primary artifact it owns                                | Secondary role                              | Must NOT own                                  |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- | --------------------------------------------- |
| Overview    | Can this client launch, and where do I go next?                         | Launch readiness panel (7 module rows, status-driven)   | Jump-off point / Operational snapshot KPIs  | Dangerous actions, raw data tables, forms     |
| Brief       | Do we understand the client and campaign?                               | Operating brief form + % completion                     | Required-field list, “open next module” nav | Mailbox, sending, or contact editing          |
| Mailboxes   | Can we safely send from connected inboxes, and at what capacity?        | Connected identities (provider, OAuth state, daily cap) | Sender readiness (allowlist/SPF/DKIM view)  | Sending, contact review, suppression          |
| Sources     | Where will prospects come from, and is enrichment configured?           | Source config + import trigger                          | “Configured / imported / ready” status      | Contact review/approval, suppression          |
| Contacts    | Who can we contact, who is excluded, and what needs review?             | Client-scoped contact table with eligibility state      | CSV import into this client                 | RocketReach config, suppression source config |
| Suppression | Who/domains must never be contacted, and is the list current?           | Source list + sync state + source-of-truth owner        | Audit link to last sync outcome             | Contact review, sends                         |
| Outreach    | What will be sent, to whom, and is it approved to launch?               | Pilot composer + explicit confirmation rail             | Governed test send (clearly separated)      | Mailbox management, contact editing           |
| Activity    | What has happened recently, and what needs attention?                   | Unified timeline (sends / replies / syncs / audit)      | Filter to client + severity                 | Being a ledger-only view                      |

Per-section disposition:

| Module      | Keep | Copy cleanup | Layout cleanup | Data/view-model | Dangerous-action guard | Responsive | **Needs Greg decision** |
| ----------- | ---- | ------------ | -------------- | ---------------- | ---------------------- | ---------- | ----------------------- |
| Overview    | ✓    | minor        | minor          | —                | —                      | ✓ (done)   | ✓ (workflow strip role) |
| Brief       | ✓    | ✓            | minor          | ✓ (“required vs nice-to-have” fields) | — | minor   | ✓ (required fields)      |
| Mailboxes   | ✓    | ✓            | ✓              | ✓ (tier labels)  | —                      | ✓          | ✓ (5-recommended vs 5-mandatory) |
| Sources     | ✓    | ✓            | ✓              | ✓ (status model) | ✓ (import → review, not auto) | —  | ✓ (scope: RR only vs multi-source) |
| Contacts    | ✓ as real route (not redirect) | ✓ | ✓ | ✓ (client-scoped query, approval flag) | ✓ (send-to-contact entry) | ✓ | ✓ (approval model)      |
| Suppression | ✓    | ✓            | minor          | ✓ (owner + staleness) | ✓ (sync)          | —          | ✓ (ownership + schedule) |
| Outreach    | ✓    | ✓            | ✓              | ✓ (prereq model) | ✓ (two-step, clear pilot vs test) | ✓ | ✓ (approval model)      |
| Activity    | ✓    | ✓            | ✓              | ✓ (timeline event types) | —              | ✓          | ✓ (event scope)          |

---

## 5b. Refined ownership model (post-Greg)

After Greg's decisions (§0), the workspace splits into seven ownership lanes.
Each lane names exactly one responsible surface and one source of truth.

| Lane                     | Responsible surface                                  | Source of truth                                                              | Owns                                                                                                  | Does NOT own                                                                                   |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Brief / onboarding       | `/clients/[id]/brief`                                 | `onboardingBrief` (form + readable view), including ops sign-off record      | Client profile, commercial, client-side contacts, campaign strategy, documents, outreach setup, sign-off | Outreach target contacts, suppression list contents, template content                        |
| Sources / imports        | `/clients/[id]/sources`                               | RocketReach and CSV intake records                                           | Accepted header schema (§0.1), import trigger, last-import status, per-client import history          | Contact eligibility rules (those live in Contacts), suppression sync                         |
| Contacts / eligibility   | `/clients/[id]/contacts` (real route, not redirect)   | Per-client contact rows + derived eligibility                                | Valid / email-sendable / suppressed / missing-email / missing-outreach-identifier counts, send-to-contact | Import pipeline (Sources), suppression list editing (Suppression), template approval          |
| Suppression              | `/clients/[id]/suppression`                           | OpensDoors-owned suppression lists (email + domain), manually synced         | Source list, sync trigger, sync state, "who owns this" label = OpensDoors / Bidlow                    | Contact table, send actions                                                                    |
| Templates / sequences    | `/clients/[id]/outreach` (or dedicated Templates tab) | Per-client templates + sequences, each with OpensDoors approval state        | Template fields (§0.5), category taxonomy, status lifecycle, sequence steps + approval                | Sending itself, contact selection                                                              |
| Outreach launch control  | `/clients/[id]/outreach` pilot panel                  | `pilotRunnable` gate evaluated against the 12-item checklist (§0.6)          | Pilot prereq evaluation, explicit confirmation rail, preview render, capacity check                   | Template editing, contact editing, suppression editing                                         |
| Activity timeline        | `/clients/[id]/activity`                              | Unified event ledger, timeline-first                                         | Sends, replies, bounces, errors, syncs, imports, OAuth, audit (§0.7)                                  | Being the place to *run* actions (acks may come later)                                         |

Cross-lane rules:
- **OpensDoors approval lives on templates and sequences**, not on individual
  contacts.
- **A valid contact** only needs one outreach identifier (email, LinkedIn,
  mobile, office number) and must not be suppressed.
- **Email-sendable** is a strict subset of valid — required only for email
  pilot sends.
- **Suppression ownership** is OpensDoors + Bidlow; the UI must say so.
- **Mailbox capacity** is recommended (5) not mandatory; the gate only
  requires ≥ 1 connected sending mailbox.

---

## 6. Recommended implementation sequence (post-Greg)

Based on §0 answers. Every PR continues to stay UI/product-focused and avoids
business-logic / migration changes unless Greg explicitly approves one.

> **Note (post-PR #23):** §0.0 supersedes parts of this sequence. PRs A, B, C
> are already merged. The next planned slice — surfacing per-row
> validity/email-sendable counts during import preview (informally "PR C2") —
> is **paused**. Before returning to import preview, the workspace must adopt
> the universal contact + named list model described in §0.0 and in
> `docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md` (`PR D0`–`PR D5`).
> Templates & sequences (was "PR E") and outreach gating (was "PR F") now
> depend on `PR D1`/`PR D2`/`PR D4`.

**PR A — Merge this docs-only audit PR.**
Merge PR #21 once it reflects Greg's decisions (this doc). No code changes.
Unblocks everything below.

**PR B — Client-scoped Contacts route.**
- Replace the `/clients/[id]/contacts → /contacts?client=[id]` redirect with a
  real workspace page.
- Render the contacts that belong to this client inside the workspace shell
  (same `max-w-6xl` layout).
- Show counts: **total**, **valid**, **email-sendable**, **suppressed**,
  **missing-email**, **missing-outreach-identifier**.
- Surface the validity rules (§0.1) in copy so operators understand the
  difference between "valid" and "email-sendable".
- Do **not** add a manual per-contact approval step yet unless the existing
  contact model already supports an approval flag cleanly.
- No schema changes.

**PR C — Import contract / readiness copy.** (merged as PR #23)
- Documented and surfaced the required CSV / RocketReach headings (§0.1) on
  the Sources and Contacts pages.
- First-class optional identifiers added to `Contact` (`linkedIn`,
  `mobilePhone`, `officePhone`, `location`, `city`, `country`). `Contact.email`
  remains required; email-optional persistence is deferred until after the
  universal contact + list model lands.

**PR C2 — Import preview view-model.** (**paused** — see §0.0)
- Intended to render per-row validity / email-sendable counts during CSV
  and RocketReach preview.
- Deferred because importing under the current `Contact.clientId` model
  reinforces the wrong ownership story. Revisit after `PR D2` lands.

**PR D0..D5 — Universal contacts + named lists.**
See `docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md`. Summary:
- `PR D0` — docs-only: capture §0.0 + plan doc (this PR).
- `PR D1` — additive `ContactList` + `ContactListMember` models; keep
  `Contact.clientId`; no destructive migration.
- `PR D2` — imports attach created/updated contacts to a named list.
- `PR D3` — client Contacts tab becomes a "client lists" view.
- `PR D4` — sequence foundation (targets a named list).
- `PR D5` — universalize `Contact` (drop `clientId`, redesign uniqueness,
  backfill list membership).

**PR E — Brief / onboarding grouped form cleanup.**
- Group brief fields into the eight sections from §0.4: Client profile,
  Commercial / account, Client contacts, Campaign strategy, Documents,
  Compliance / suppression, Outreach setup, Operations sign-off.
- Prefer extending the existing JSON `formData` shape before any schema
  migration — new sections can live inside `formData` as sub-objects.
- Render the brief as both an editable form and a readable operating brief
  (read mode with an "edit" affordance).
- Show the ops sign-off user + timestamp once sign-off is ticked.

**PR F — Templates / sequences foundation.**
- Depends on `PR D1`/`PR D2` so sequences can target a named list.
- Introduce client-specific templates and a sequence builder (§0.5).
- Template fields: name, category, subject, content, status.
- Sequence fields: name, client, ordered template steps, follow-up delay,
  active flag, `approvedByOpensDoors`, `approvedAt`, targeted list id.
- Placeholder helper listing the supported tokens (§0.5) with the
  `{{sender_company_name}}` vs `{{company_name}}` distinction called out.
- OpensDoors approval status visible on both templates and sequences.

**PR G — Outreach gating.**
- Make pilot send depend on the full 12-item checklist from §0.6:
  brief complete → ops sign-off → ≥ 1 mailbox → ≥ 1 email-sendable contact
  → suppression configured → suppression synced → ≥ 1 approved introduction
  template → sequence exists → sequence approved by OpensDoors → preview
  renders → capacity available → explicit typed confirmation.
- Keep `SEND PILOT` confirmation. Show which gates are unmet with links to
  the responsible lane.

**PR H — Activity timeline.**
- Promote Activity to a unified timeline covering: sends, replies, bounces,
  errors, syncs, imports, OAuth connect/disconnect, audit events (§0.7).
- Timeline-first layout; filters later.

Every PR stays UI/product-focused until Greg approves a behavior change
(e.g. a new approval flag, schema migration, or scheduled sync).

---

## 7. Questions for Greg

Answers captured in §0 are marked **Answered** below. Unanswered questions
remain open for a future pass; they are not blockers for the PR sequence in
§6.

### Overview
- Q1. What are the 3 things you want to know within 10 seconds of opening a
  client? **Open** — deferred; current readiness panel is acceptable for now.
- Q2. Should Overview remain status/navigation only, or should a small number
  of operational actions live there (e.g. “Sync suppression”, “Queue pilot”)?
  **Open** — deferred.
- Q3. Should the workflow strip stay, become a breadcrumb-style progress
  indicator, or go away entirely now that readiness rows exist? **Open** —
  deferred; strip stays as in-page nav.

### Brief
- Q4. What fields are **mandatory before a client can launch**?
  **Answered** — see §0.4. Required sections: Client profile, Commercial /
  account, Client contacts, Campaign strategy, Documents, Compliance /
  suppression, Outreach setup, Operations sign-off. The ops sign-off
  checkbox (with user + timestamp) is itself a required launch gate.
- Q5. Should Brief be a form, a checklist, or a readable operating brief with
  an “edit” affordance? **Answered** — both editable form and readable
  operating brief (§0.4).
- Q6. Who edits the brief: only OpensDoors staff, or can the client fill it
  in a limited view later? **Open** — deferred; assume OpensDoors staff for
  now.

### Mailboxes
- Q7. Is 5 connected mailboxes always the target, or recommended?
  **Answered** — recommended, not mandatory (§0.3). Capacity =
  `connected sending mailboxes × 30/day`.
- Q8. Blast-radius story for add/remove mid-campaign? **Open** — deferred.
- Q9. Mailbox health scope (SPF/DKIM/DMARC)? **Open** — OAuth + capacity only
  for now.
- Q10. Primary/governed mailbox visually distinct from the pool? **Open** —
  deferred.

### Sources
- Q11. Sources: RocketReach only or also CSV / manual / named batches?
  **Answered (partial)** — CSV and RocketReach must both be supported using
  the header schema in §0.1. Named batches deferred.
- Q12. Which RocketReach filters matter most? **Open** — deferred.
- Q13. Should imports auto-enter Contacts as eligible, or land in "Review"?
  **Answered** — no manual per-contact approval yet (§0.1). Imports are
  evaluated against the valid / email-sendable rules; OpensDoors approval
  happens on templates / sequences, not contacts.
- Q14. Per-client daily import cap? **Open** — deferred.

### Contacts
- Q15. What makes a contact "approved for outreach" today?
  **Answered** — a contact is **valid** if it has at least one of (email,
  LinkedIn, mobile, office number) and is not suppressed. An **email-sendable**
  contact is a valid contact that also has an email address. No separate
  manual approval flag for now (§0.1).
- Q16. Manual approval before pilot sends, or eligible + unsuppressed enough?
  **Answered** — email-sendable + unsuppressed is enough at the contact
  level. Approval lives on templates / sequences (§0.1, §0.5).
- Q17. Duplicate detection surfaced in UI? **Open** — deferred.
- Q18. Stop the Contacts redirect and render a real client-scoped view?
  **Answered — yes** (§0.1). This becomes PR B.

### Suppression
- Q19. Who owns suppression lists? **Answered** — OpensDoors owns it; Bidlow
  and OpensDoors manage it together (§0.2).
- Q20. Manual-only or scheduled sync? **Answered** — manual for now (§0.2).
  Scheduled sync deferred.
- Q21. UI contract for a suppressed row? **Open** — deferred; current default
  (exclude from sendable) is acceptable.
- Q22. Domain vs email distinction filterable? **Open** — deferred, but both
  email list and domain list are first-class brief fields (§0.4).

### Outreach
- Q23. What must be checked before allowing a pilot send?
  **Answered** — the 12-item gate in §0.6.
- Q24. Who approves messaging? **Answered** — OpensDoors approves
  templates / sequences per client (§0.5, §0.6).
- Q25. Split Governed test and Controlled pilot into separate routes?
  **Open** — deferred; same route is acceptable as long as PR F makes the
  pilot gate explicit.
- Q26. Written reason / linked brief version for audit? **Open** — deferred;
  audit events will be in the Activity timeline (§0.7) regardless.

### Activity
- Q27. What activity matters most, in priority order?
  **Answered** — sends, replies, bounces, errors, syncs, imports, OAuth,
  audit (§0.7).
- Q28. Timeline, task list, or report view? **Answered** — timeline-first;
  filters later (§0.7).
- Q29. Include cross-module events (sync, import, OAuth, webhook)?
  **Answered — yes** (§0.7).
- Q30. Is Activity the place to acknowledge errors? **Open** — deferred.

### Cross-cutting
- Q31. Global vs per-client views. **Open** — deferred; per-client Contacts
  route (PR B) partially resolves this.
- Q32. Visible launch-gate badge stored on the client row? **Open** —
  deferred; the 12-item gate in §0.6 is the mechanism even without a stored
  flag.
- Q33. Mobile priority level? **Open** — deferred.

### Decisions I can make without Greg (reaffirmed)
- Wording cleanup on headers / descriptions.
- Responsive tightening on mailboxes / outreach / activity.
- Making the Overview workflow strip act as in-page nav only.
- Adding Activity event types in the existing panels without changing server
  contracts until PR G.

### Recommended next implementation PR
**PR B — client-scoped Contacts route.** Greg answered Q15, Q16, Q18 (§0.1).
This is the highest-impact fix for the “bolted-on tools” feeling because it
removes the most visible cross-app jump and lets the workspace render
`total / valid / email-sendable / suppressed / missing-email /
missing-outreach-identifier` using the rules in §0.1 — with no schema change
and no manual approval step introduced.
