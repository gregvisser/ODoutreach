# ODoutreach — Staff handover smoke test

> **Status: HANDOVER-READY (last updated PR #140).** Every step below is
> marked **READY**. The audit programme treats this document as the
> standing smoke test a non-technical staff member can run end-to-end
> without developer presence.

The smoke test is written for a non-technical staff member. It is **safe by
default** — every step that could send email, consume credits, or write to
production data is gated behind explicit pre-flight checks.

---

## 0. Hard safety rules

These rules apply at every step:

- **Do not** click `Launch sequence` unless explicitly told to.
- **Do not** click `Send` on a contact unless test mode is confirmed.
- **Do not** click `Process outbound queue` (Admin Operations).
- **Do not** click `Sync replies` unless explicitly approved.
- **Do not** click `Reconnect mailbox` or remove a mailbox.
- **Do not** delete contacts, lists, sequences, or templates in production.
- **Do not** run RocketReach live searches in production unless approved.
- **Do not** paste real prospect emails into ad-hoc test sends.

If a screen is unfamiliar, stop and ask. **Reports** (left sidebar) is always
safe to view — it is read-only.

---

## 1. Login (READY)

1. Open the portal URL.
2. Click **Sign in with Microsoft**.
3. Complete MFA when prompted.
4. You land on **Reports**. (Pre-#135: you used to land on Dashboard. After
   PR #135 the default is Reports — a richer operational view.)

**Expected:** No errors. You see the Reports header and metric cards.
If you see "Staff access" / "Inactive" / "Email blocked", stop and contact Greg.

## 2. Select client (READY)

1. Click **Clients** in the left sidebar.
2. Pick a client (e.g. **OpensDoors**).
3. You land on the client **Overview**.

**Expected:** Client name, status badge, getting-started card, launch
readiness, operational snapshot.

(Pre-#135 there was a duplicate "Workspace status" card here — that is
removed in #135.)

## 3. Check mailboxes (READY for view only — PR #139)

1. Open the **Mailboxes** tab. The page is titled
   **"Connected sending mailboxes — {client name}"**.
2. Read the **"What happens when you connect a mailbox?"** explainer
   card directly under the title. It states plainly that no email is
   sent on connect, that replies are read back from connected
   mailboxes, and that pool capacity is the sum of every connected
   mailbox's daily limit.
3. Confirm at least one Microsoft mailbox and one Google mailbox is
   marked **Connected** in the status column.
4. Confirm `Can send` and `Can read replies` for both.
5. Look at the status sublabels for any non-Connected row — they should
   read in plain English ("Finish sign-in in the Microsoft or Google
   window, or press Connect again", "Microsoft needs a fresh sign-in
   for this mailbox …"). No raw OAuth/tenant jargon.

**Do not** click `Reconnect`. **Do not** click `Disconnect`. **Do not**
remove a mailbox. **Do not** click `Run internal proof send` (admin
tool).

(PR #117 — `fix/mailboxes-remove-clutter-copy` — is **superseded** by
PR #139. The same dev-jargon removals are in PR #139 plus the explainer
card and broader test coverage.)

## 4. Add / import / search contacts (READY for view, GATED for live writes)

After PR #138:

- **Sources tab (per client)** — leads with a "What we import for every
  contact" card showing the twelve canonical fields (Name, Employer,
  Industry, First/Last Name, City, Country, Linkedin, Job1 Title,
  A Emails, Mobile Number, Office Number). CSV upload and RocketReach
  search both write to the same twelve fields.
- **RocketReach (in client Sources)** — visible "Search prospects on
  RocketReach" section. Opening the page does NOT consume credits. A
  live search still requires (a) a list target, (b) the confirmation
  phrase typed in, and (c) the API key configured. Do not type the
  confirmation phrase during the smoke test.
- **Universe (global sidebar)** — viewing and searching is always safe.
  Use the **Columns shown** panel to hide contact-field columns to fit
  your screen (selection is saved in the URL). Sort by Last seen, Name,
  Employer, Country, City, or A Emails.
- **CSV import** — for live imports use a non-production workspace and a
  small test CSV (under 5 rows). The CSV form has a preview step
  before saving.

## 5. Create a list (READY for view only)

1. Open **Sources** (or **Universe**).
2. Filter contacts as needed.
3. Click **Create list** — this only creates the list; it does not send anything.

**Do not** click **Attach list to sequence** unless step 6 is also approved.

## 5a. Inspect a list (READY — PR #138)

1. In a client workspace, open **Lists** (subnav).
2. The page shows list KPIs (Total lists, Unique contacts, Ready to email,
   Suppressed, Missing email, Missing identifier).
3. Click **Open list** on any card to land on
   `/clients/[id]/lists/[listId]` — the list-detail page already shows
   delivery status and members.

## 6. Create a sequence (GATED)

1. Open **Outreach** in the client workspace.
2. Click **New sequence** (collapsed under a `<details>` block).
3. Fill in name, template, schedule, contact list.
4. Save as **Draft**.

**Do not** click **Launch sequence**.

## 7. Confirm template (READY)

1. Open **Templates**.
2. Open the template the sequence uses.
3. Read it end-to-end. Check sender display name, signature, links,
   unsubscribe footer.

## 8. Launch (LIVE) (GATED — Greg approval required)

This step **only** runs in staging or with explicit Greg approval.
Skip it in handover dry-runs.

If approved:

1. Outreach → select the draft sequence.
2. Review the launch readiness card. All checks must be green.
3. Click **Review and launch**.
4. Confirm via the modal (typed confirmation phrase).

## 9. View list delivery status (READY)

1. Client workspace → open the list detail page.
2. Confirm per-row delivery status: Queued / Sent / Delivered / Replied /
   Bounced / Failed / Suppressed.
3. Cross-reference against **Reports** → Live metrics.

From PR #136 onwards: when a client's provider does not emit delivery
webhooks, the per-row "Delivered" column and the Reports delivery card
both render **Not tracked** instead of a misleading 0%.

## 10. View replies (READY)

1. Client workspace → **Activity**.
2. Replies are grouped by mailbox (PR #134).
3. Each mailbox row shows the linked sequence reply count. Expand the
   row to see individual replies.
4. From PR #137: each reply has an **Open reply →** link to a dedicated
   detail page.

The sequence timeline below the replies panel is collapsed by default
(PR #137). Expand "Recent sequence events" only if you need the raw
event stream.

## 11. Reply handling (READY — PR #137)

After PR #137:

1. From the replies panel, click **Open reply →** next to any linked
   reply.
2. The reply detail page shows:
   - The reply body / preview.
   - A staff-friendly status badge for the sequence enrolment
     ("Active follow-ups" / "Stopped (completed)" / "Paused" /
     "Excluded (operator)").
   - The original outbound subject, sent time, and sequence name.
   - Contact context (suppressed flag if applicable).
3. **Reply from {mailbox}** — click **Open inbox view to reply →**. You
   land on the existing inbox message page where you can compose a
   reply that threads against the original conversation and counts
   against the mailbox daily send cap. (No email is sent from the
   reply detail page itself.)
4. **Stop follow-ups** — clicking this marks the enrolment as
   `COMPLETED`, which prevents the planner and dispatcher from sending
   any further follow-up steps for that prospect. It does not send
   email.
5. **Pause follow-ups** — clicking this marks the enrolment as
   `PAUSED`, which has the same skip-on-plan / skip-on-dispatch
   behaviour but signals "temporary hold". It does not send email.

Automatic behaviour:

- Whenever a linked reply lands (mailbox sync or webhook), the matching
  enrolment is auto-flipped to `COMPLETED`. You do not have to click
  "Stop follow-ups" for new replies — staff just need to read and
  respond.
- Operator-suppressed (`EXCLUDED`) enrolments are never overwritten.
- "Resume" is not yet exposed in the UI — by design (resuming an old
  enrolment whose follow-up delay has elapsed would send immediately on
  the next plan-and-drain).

## 12. Check reports (READY)

1. Open **Reports**.
2. Use the filter chips at the top right to switch between **All accessible
   clients** and a single client.
3. Verify the headline four cards (Sent / Queued / Replies / Delivery)
   reconcile with what you saw in step 9.
4. Skim the "What these metrics mean" panel before quoting any number to
   a client.

Notes after PR #136:

- All metrics are **All-time** and labelled as such in the scope strip.
- **Sent** is provider-proof only — queued and proof-missing rows are
  counted separately and never inflate the headline number.
- **Delivery** shows **Not tracked** for clients whose provider does not
  emit delivery webhooks. The rate column shows `—` in that case.
- **Opens** always shows **Not tracked**. Reply rate is the engagement
  signal.
- The per-client breakdown totals should add up to the headline totals
  for the All-accessible-clients view.

## 13. Check do-not-contact (READY — PR #138)

1. Open **Do-not-contact** (global sidebar or client tab).
2. The global page is titled **"People blocked from outreach"** and shows
   a "How do-not-contact works" explainer card listing the four sources
   of suppression (manual lists, unsubscribes, bounces/provider blocks,
   per-client safety rules).
3. The Connected sheets table shows staff-friendly labels — "Email
   addresses" / "Whole domains" for list type, and connection-status
   labels like "Last sync succeeded" / "Sync in progress" / "Not
   connected" (no raw enums).
4. Confirm any opt-outs / unsubscribes since last sync appear.
5. **Do not** click any unsuppress action. **Do not** click **Sync**
   during this smoke unless explicitly approved — it triggers a live
   Google Sheets read.

## 14. Archive / remove sequence (READY — PR #140)

1. Open a client workspace and click **Outreach**.
2. Locate any sequence with send history. The action button reads
   **"Delete or archive sequence"** (not just "Delete").
3. Click it. The confirmation message says: *"Sequences with send
   history are kept for audit (archived); only draft sequences that
   have never sent can be hard-deleted."* — confirm or cancel as
   appropriate during the smoke. For the smoke walkthrough, cancel.
4. Below the active list, expand the **"Archived sequences (N)"**
   `<details>` disclosure. Each archived row exposes a
   **Restore to draft** button.
5. Spot-check that clicking Restore to draft on a known archived
   sequence returns it to DRAFT — no send history is lost.

Notes after PR #140:

- Hard delete is only possible for sequences that have never sent a
  step. Any sequence with `SENT` / `FAILED` / linked outbound rows
  is routed through archive, not delete, on the server.
- Restore is reversible — it flips the status back to DRAFT and the
  sequence reappears in the active list. It does not re-launch or
  re-send anything.

## 15. Settings audit (READY — PR #139)

1. Open **Settings** from the main sidebar.
2. Read the **"Where to change what"** card at the top — it states that
   Settings holds Branding, who can sign in, sign-in provider, email
   provider mode, and cross-app integrations; per-client items
   (Brief / Mailboxes / Sources / Lists / Do-not-contact / Templates /
   Outreach / Activity) live inside each client workspace.
3. Confirm each section renders with a status pill:
   - **Branding** — admin-only editor with a link to `/settings/branding`.
   - **Team access** — admin-only "Staff and roles" card (regular staff
     see the "Only administrators can…" message).
   - **Your account** — your sign-in email + role.
   - **Sign-in and security** — Microsoft Entra ID + domain allowlist
     (Enforced / Not enforced).
   - **Sending and compliance** — `Resend connected` or `Test mode`.
     Unsubscribe & List-Unsubscribe rules summarised.
   - **Integrations** — Google Workspace suppression + RocketReach
     status pills (`Connected` / `Not connected`).
4. **Do not** click any control that mutates Settings during the smoke
   test. Branding edits, staff role changes, and Microsoft 365 tenant
   policy changes are real admin actions.

## 16. Training audit (READY — PR #139)

1. Open **Training** from the main sidebar.
2. The page renders nine modules; module 5 is **"Lists and email
   readiness"** and module 6 is **"Do-not-contact — email and domain
   sheets"**. (Pre-#139 these were titled "Contacts" and "Suppression".)
3. Scroll to the new **"Staff handover checklist"** card — 11 numbered
   steps with portal deep-links where applicable. Verify the list runs
   from "Understand Reports" through "Check mailbox status".
4. Open the printable guide at `/training/staff-handover`. The "Daily
   workflow checklist" should include a "Stop follow-ups after a reply"
   step; the "Admin operations" section should explicitly note Admin
   Operations was removed from the sidebar in PR #135.
5. Training pages are **read-only**. Nothing on `/training` sends
   email, runs imports, syncs mailboxes, or changes settings.

## 17. Sidebar / nav final check (READY — PR #140)

The main sidebar **must** show exactly these entries, in order:

`Reports`, `Clients`, `New client`, `Universe`, `Do-not-contact`,
`Training`, `Settings`.

Confirm `Dashboard`, `Admin operations`, a global `Contacts` entry,
**and** a global `Activity` entry are **not** present. Each was
intentionally removed: Dashboard and Admin Operations in PR #135,
Contacts in PR #138, global Activity in PR #140.

The legacy URLs (`/dashboard`, `/operations/outbound`, `/contacts`,
`/activity`) still resolve for admins; non-admin staff are redirected
away. `/dashboard` redirects to `/reporting` for everyone.

Inside any client workspace, the subnav **must** show exactly:

`Overview`, `Brief`, `Mailboxes`, `Sources`, `Lists`, `Do-not-contact`,
`Templates`, `Outreach`, `Activity`.

`Lists` is the post-PR-138 label for the old `Contacts` tab.
`Do-not-contact` is the post-PR-138 label for the old `Suppression` tab.

## 18. Final handover checklist (READY — PR #140)

The audit programme commits to the following end-to-end checklist for
the first staff-led campaign run without developer presence.

1. **Create or check the client.** Open Clients, open the target
   workspace, confirm the workspace header shows the right status pill
   (ONBOARDING vs ACTIVE).
2. **Connect mailboxes.** Mailboxes tab. Confirm at least one
   mailbox is **Connected**; do not touch Connect / Reconnect /
   Remove during the smoke unless approved.
3. **Import contacts.** Sources tab. Either upload a CSV (and click
   Preview only — Confirm is the write step) or use the existing
   per-client list.
4. **Check Universe.** `/universe`. Confirm imported contacts are
   visible in the cross-client directory; use search / filter /
   column toggles to spot-check.
5. **Check Lists.** Lists tab. Open the target list (`/clients/[id]/lists/[listId]`),
   use the new search / status filter / sort controls (PR #140) to
   review who is in scope.
6. **Check Do-not-contact.** Per-client Do-not-contact tab (and the
   global `People blocked from outreach` page). Confirm any
   suppression rows that should apply are present. Do **not** click
   **Sync** during the smoke.
7. **Create a template.** Templates tab. Save a draft introduction.
8. **Create a sequence.** Outreach tab. Pick a list, mailbox, and
   template. Save (does not send).
9. **Review recipients.** Open the sequence's recipient panel and
   skim the eligibility breakdown.
10. **Launch sequence.** Type the confirmation phrase only when ready
    to actually launch. For the smoke, stop here.
11. **Process the queue if needed.** ONLY when admin approves.
12. **Check Reports.** `/reporting`. Confirm Sent / Replies / Delivery
    cards move as expected. All numbers are live database counts.
13. **Check Activity replies.** Per-client Activity tab. Confirm the
    replies-by-mailbox panel surfaces any new replies; the global
    `/activity` route is **admin-only** (PR #140) and is not the
    operational view.
14. **Open a reply.** Click into a reply event to land on the linked
    reply detail page. Read it.
15. **Stop follow-ups.** If a contact has clearly opted out of
    further sending, click **Stop follow-ups for this contact** on
    the reply detail page. The enrolment flips to COMPLETED; no
    queued steps will fire.
16. **Verify no unsafe admin routes in staff nav.** Re-run step 17
    above. The sidebar must NOT advertise Dashboard, Admin operations,
    global Contacts, or global Activity. Per-client Activity is the
    operational surface for replies.

## 19. Troubleshooting

If something looks wrong:

1. Note the URL, time, client, and what you did.
2. Take a screenshot (no PII visible).
3. Open **Reports** and confirm the metric in question.
4. Message Greg.

Never run **Process outbound queue**, **Sync replies**, or **Release stale
locks** without Greg's approval.
