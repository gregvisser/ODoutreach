# OpensDoors Outreach — Team Runbook

A practical, plain-English guide for the OpensDoors team to run the system
day-to-day **without** the developer. The developer (Greg) only handles
**support tickets** and a few locked admin tools (listed at the end).

Every active staff member can see every client and use every feature below.

---

## 1. Mailboxes — the thing you'll touch most

Each client has its own sending mailboxes on its **Mailboxes** tab.

**A mailbox shows "Connection error" / "needs reconnect":**
1. Open the client → **Mailboxes**.
2. Find the row, press **Reconnect**, and sign in to that mailbox in the window
   that opens.
That's it — any staff member can do this. Reconnecting never deletes past send
history.

**Google mailboxes expire about weekly.** The Google sign-in app is in
"Testing" mode, so Google logins lapse roughly every 7 days. The row will nudge
you ("Google logins expire about weekly — press Reconnect now…") after ~6 days.
**Reconnect proactively** when you see that, so sending never stops. If it does
lapse, the row flips to "Connection error" with a Google-specific message —
just press **Reconnect**.

**Adding a NEW Google mailbox:** the person's email must be on the Google
test-users list first. Go to **Settings → Google OAuth — test users**, add the
address, then go back to the client's Mailboxes tab and press **Connect**.

**Adding a NEW Microsoft mailbox:** press **Connect** and sign in. If you see
"Need admin approval," that mailbox's organisation blocks staff from approving
outside apps — copy the **approval link** shown on the Mailboxes page and send
it to the client's IT administrator. They approve once for the whole domain,
then every mailbox on that domain connects normally.

**Signatures:** a mailbox needs a saved signature before its sequence can
launch (we never send from a mailbox with no signature). Set it on the
Mailboxes tab — **Set signature** (paste HTML), or **Sync from Gmail** for
Google mailboxes.

---

## 2. "Why didn't this send / why was it skipped?"

A contact is skipped before a send for one of these reasons (the sequence's
**blocked recipients** list spells out which):

- **10-day cooldown** — that email was contacted in the last **10 days** by
  *any* client. It becomes eligible again automatically after 10 days.
- **Do-not-contact** — the address or its domain is on the suppression list, or
  they unsubscribed or hard-bounced.
- **No email address** — the contact has no email (LinkedIn/phone only).
- **Not eligible yet** — a follow-up's delay hasn't elapsed.

## 3. "Why won't the Launch button work?"

The amber **Launch readiness** panel above the button lists what's missing. The
button stays disabled until they're cleared. Common ones:
- A connected sending mailbox is **missing its signature**.
- **No connected sending mailbox** for the client.
- **No daily capacity** left.
- The introduction **template isn't finished/approved**.

Follow-up "sends automatically" blocks only appear **after** the introduction
has sent to at least one person.

---

## 4. Do-not-contact (suppression)

On each client's **Do-not-contact** tab:
- **Quick add** — block one email or whole domain immediately. Takes effect on
  the very next send. Available to everyone, and kept even when a sheet re-syncs.
- **Google Sheet sync** — bulk lists from a connected Google Sheet. Press
  **Sync** to pull the latest rows.
  - ⚠ A sync **replaces** the whole list. If you edit the sheet and remove rows,
    those people are no longer blocked. After a sync the page **warns you** if
    it removed previously-blocked entries ("Wrote N, but M … were removed") —
    if that wasn't intended, add them back to the sheet and sync again.

---

## 5. Imports, sequences, replies

- **Import contacts:** client → **Sources** → upload a CSV (preview first, then
  Confirm). You stay on the page and see "imported N / attached M / skipped K".
- **Set up a sequence:** client → **Templates** → write and save an
  Introduction template (plus any Follow-up 1–5 templates you want) — a
  template must be **Saved** before it can go in a sequence. Then client →
  **Outreach** → **New sequence** → name it, pick the target list and a
  mailbox → add the Introduction step (required) and up to five Follow-up
  steps, each with its template and delay → **Save sequence**.
- **Launch a sequence:** client → **Outreach** → Review recipients → Launch.
  (Launch stays locked until the mailbox has a saved signature, has sending
  capacity, and the Introduction template is finished.)
- **Replies** land on the client's **Activity** tab; opt-outs and bounces add
  themselves to do-not-contact automatically.
- **Reports:** the **Reports** tab has live counts per client and a date range.

---

## 6. Hit a bug or something's wrong?

File a **Support** ticket (Support tab) — add a title, detail, priority, and a
screenshot. The developer picks it up, fixes it, and closes it. That's the one
thing the team hands back to the developer.

---

## 7. What only the developer (owner account) does

These are locked to the owner account on purpose — they're administrative or
irreversible, so a wrong click can't create cleanup work:

- **Resolve / reopen support tickets.**
- **Staff access** — invite or remove who can log in (Settings → Staff access).
- **Delete / restore a whole client workspace** (the danger zone).
- **Reset pre-production data** / **Clear replies** (irreversible data wipes).
- **Queue / delivery diagnostics** (Operations).

Need one of those? Ask the developer. If the team should own any of them too,
the developer can open it up in one change.
