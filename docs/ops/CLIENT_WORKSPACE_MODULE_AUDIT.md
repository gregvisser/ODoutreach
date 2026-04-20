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

## 6. Recommended implementation sequence (after Greg decides)

1. **PR A — Overview strip demotion.** Reduce the workflow strip to in-page
   navigation only; make readiness rows the single “status” voice. Possibly
   collapse strip on mobile.
2. **PR B — Contacts module as real route.** Stop the redirect. Render a
   client-scoped contacts view inline so the workspace stops widening from
   `max-w-6xl` to `max-w-7xl`. Add approval/“ready for outreach” flag if Greg
   confirms the model.
3. **PR C — Outreach safety rail.** Visually separate Governed test from
   Controlled pilot (two steps, clear labels), and bake approval state into
   the pilot prereqs.
4. **PR D — Suppression ownership + schedule.** Copy + small view-model changes
   for owner attribution and staleness; optionally scheduled sync if approved.
5. **PR E — Activity as unified timeline.** Promote the ledger to a timeline
   that includes syncs, imports, webhooks, and send outcomes; drop the
   inbox-preview card down or move it to Mailboxes.
6. **PR F — Mailboxes capacity polish.** “Recommended capacity” framing +
   two-column identities grid on wide screens.
7. **PR G — Brief field model.** Explicit required-for-launch subset; readiness
   aligns with Overview readiness exactly.

Every PR stays UI/UX-only until Greg approves a behavior change (e.g. approval
flag, scheduled sync).

---

## 7. Questions for Greg

This is the core of this pass. Please answer each; we’ll turn the answers into
the PR sequence above.

### Overview
- Q1. What are the 3 things you want to know within 10 seconds of opening a
  client? (We can tune the readiness rows/snapshot to those exactly.)
- Q2. Should Overview remain status/navigation only, or should a small number
  of operational actions live there (e.g. “Sync suppression”, “Queue pilot”)?
- Q3. Should the workflow strip stay, become a breadcrumb-style progress
  indicator, or go away entirely now that readiness rows exist?

### Brief
- Q4. What fields are **mandatory before a client can launch**? Current
  `computeOnboardingBriefCompletion` treats a set of fields as required —
  please confirm or correct that set.
- Q5. Should Brief be a form (today), a checklist, or a readable operating
  brief with an “edit” affordance? If brief is long, do we need sections with
  “save & continue”?
- Q6. Who edits the brief: only OpensDoors staff, or can the client fill it in
  a limited view later?

### Mailboxes
- Q7. Is 5 connected mailboxes **always** the target, or should the UI show
  “recommended capacity” based on client size / volume goals (and allow fewer)?
- Q8. What is the correct blast-radius story for adding/removing a mailbox
  mid-campaign — instant, requires confirmation, or only allowed if no pilot
  is in flight?
- Q9. Should mailbox health eventually include DNS/SPF/DKIM/DMARC/reputation,
  or only OAuth + send capacity for now?
- Q10. Should the primary/governed mailbox be visually distinct from the pool
  (today they co-exist in one list)?

### Sources
- Q11. Should Sources focus only on RocketReach, or also support CSV, manual
  entry, and named “source batches” equally on this tab?
- Q12. Which RocketReach filters matter most: industry, location, company
  size, titles, keywords? (We’ll build the import builder around those, not
  around RR’s raw schema.)
- Q13. Should an import auto-enter Contacts as eligible, or should it land in
  a “Review” state until a human approves?
- Q14. Is there a per-client **daily import cap** you want enforced in UI?

### Contacts
- Q15. What makes a contact “approved for outreach” in your process today?
  (Field on the row, manual ticked flag, all imported = eligible unless
  suppressed?)
- Q16. Do you want manual approval before pilot sends, or is eligible +
  unsuppressed enough?
- Q17. Should duplicate detection be surfaced in UI (email, domain, linkedIn),
  and if so which fields are the de-dup keys?
- Q18. Should we drop the `/clients/[id]/contacts → /contacts?client=[id]`
  redirect and render a real client-scoped contacts view inside the
  workspace? (Strong recommend yes — this is the biggest “bolted-on” issue.)

### Suppression
- Q19. Who **owns** suppression lists for each client: Greg/Bidlow, OpensDoors
  shared, or the individual client?
- Q20. Should suppression sync be manual-only, or eventually scheduled (e.g.
  hourly/daily)? If scheduled, does stale > N hours block sending?
- Q21. If a client row is on a suppression sheet, what’s the UI contract —
  hidden from contacts, struck-through, or visibly tagged “suppressed”?
- Q22. Should the domain vs email distinction be visible and filterable in
  the UI?

### Outreach
- Q23. What must be checked before allowing a pilot send, beyond today’s
  `outreachPilotRunnable`? (e.g. brief complete, approval flag, preview
  opened, subject sanity-check.)
- Q24. Who approves the actual messaging: Greg, OpensDoors, or the client
  (“client signs off on copy before we pilot”)?
- Q25. Should Governed test and Controlled pilot live on the same route, or
  split into Outreach → Test and Outreach → Pilot (clearer blast-radius)?
- Q26. Should every pilot have a written reason / linked brief version for
  audit?

### Activity
- Q27. What activity matters most to operators, in priority order: sends,
  replies, syncs, imports, errors, audit trail, webhook events?
- Q28. Should Activity be a **timeline**, a **task list** (things that need
  operator action), or a **report view** (what happened today)?
- Q29. Should the client-scoped Activity include cross-module events (sync,
  import, OAuth reconnect, webhook) — not just sends + inbox preview?
- Q30. Should Activity be the place where operators “acknowledge” errors, or
  does that live elsewhere (Operations, alerts)?

### Cross-cutting
- Q31. Global sidebar (Contacts / Suppression / Activity / Operations) vs
  per-client workspace (same names) — should global views be strictly
  cross-client summaries, with client-scoped views only inside a workspace?
- Q32. Should the workspace enforce a visible **launch gate** (e.g.
  `Launch-ready` badge that flips to `Launched` after first successful pilot),
  and is that state stored on the client row?
- Q33. Mobile: do operators actually use this on mobile, or is
  tablet+desktop the real target? (This changes how aggressively we compress
  mobile layouts.)

### Decisions I can make without Greg
- Wording cleanup on headers/descriptions.
- Tightening responsive stack on mailboxes/outreach/activity.
- Making Contacts a real client-scoped route instead of a redirect (no data
  model change needed — same `listContactsForStaff` with `clientId`).
- Separating Governed test from Controlled pilot visually on Outreach, keeping
  behavior identical.
- Making the Overview workflow strip act as in-page nav only (no metric copy).
- Adding Activity event types in the existing panels without changing server
  contracts (e.g. show last suppression sync result in the ledger).

### Decisions Greg must make before implementation
- Required-vs-nice-to-have brief fields (Q4).
- Contact approval model (Q15, Q16, Q23, Q24).
- Suppression ownership + sync schedule policy (Q19, Q20).
- Whether Outreach should split into Test + Pilot (Q25).
- Whether to stop the Contacts redirect and render inline (Q18 — strongly
  recommend yes; still wants your OK).
- Whether 5-mailbox target is recommended or mandatory (Q7).
- Mobile priority level (Q33).

### Recommended next PR after Greg answers
`PR B — client-scoped Contacts route` is the highest-impact fix for the
“bolted-on tools” feeling because it removes the most visible cross-app jump
and lets us stop duplicating contact state between client vs global views. It
only needs Q15, Q16, Q18 answered.
