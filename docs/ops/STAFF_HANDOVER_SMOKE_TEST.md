# ODoutreach — Staff handover smoke test

> **Status: DRAFT (last updated PR #136).** This document is filled out
> progressively by the audit programme as each surface is cleaned. Until
> then, follow only the steps marked **READY** and ask Greg before running
> anything marked **GATED**.

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

**Expected:** Client name, status badge, workflow strip, getting-started card,
launch readiness, operational snapshot.

(Pre-#135 there was a duplicate "Workspace status" card here — that is
removed in #135.)

## 3. Check mailboxes (READY for view only)

1. Open the **Mailboxes** tab.
2. Confirm at least one Microsoft mailbox and one Google mailbox is
   `Connected`.
3. Confirm `Can send` and `Can read replies` for both.

**Do not** click `Reconnect`. **Do not** remove a mailbox.

(Mailboxes UI clean-up is PR #117 — once merged, this step uses only the
Connected / Can send / Can read replies / Daily limit / Last sync / Action
needed columns.)

## 4. Add / import / search contacts (GATED)

This step is **GATED** until PR #138 ships and Sources gets a proper test
mode. Until then:

- CSV import: use the **Imports** screen with a test CSV (under 5 rows) in a
  non-production workspace only.
- RocketReach: do not run live searches without Greg's approval.
- Universe: viewing and searching is always safe.

## 5. Create a list (READY for view only)

1. Open **Sources** (or **Universe** after #138).
2. Filter contacts as needed.
3. Click **Create list** — this only creates the list; it does not send anything.

**Do not** click **Attach list to sequence** unless step 6 is also approved.

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
3. Click a reply → confirm it links to a sequence outbound (the linked
   outbound chip).

(Until PR #137, the long audit timeline below replies will be visible and
noisy. After #137 it is hidden behind an "Audit log" expander.)

## 11. Reply handling (GATED until PR #137)

Until reply handling lands in #137:

- You can **read** linked replies and the source outbound.
- You cannot **send a reply** from ODoutreach yet.
- You cannot **pause/complete** an enrollment from the reply UI — but
  the send planner already excludes contacts with linked replies from
  future follow-ups (verified in #137 with tests).

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

## 13. Check do-not-contact (READY)

1. Open **Do-not-contact** (global or client tab).
2. Confirm any opt-outs/unsubscribes since last sync appear.
3. **Do not** click any unsuppress action.

## 14. Archive / remove sequence (GATED until PR #139)

Until PR #139:

- Active sequences are visible.
- Hard-delete is risky for any sequence with send history. PR #139 makes
  delete safe by blocking it for sequences with send history and surfacing
  Archive instead.

## 15. Troubleshooting

If something looks wrong:

1. Note the URL, time, client, and what you did.
2. Take a screenshot (no PII visible).
3. Open **Reports** and confirm the metric in question.
4. Message Greg.

Never run **Process outbound queue**, **Sync replies**, or **Release stale
locks** without Greg's approval.
