# ODoutreach — start here

Last updated 2026-08-29 evening. **Read this first in any new task.** It is the
state of play, not the history. The history is in `.bidlow/relay/QUEUE.md` and in
`C:\Bidlowbusiness\_odoutreach-handover\`.

---

## What this is

A live cold-outreach system. OpensDoors is an agency; they run outreach for about
eighteen of their own clients, sending from those clients' own mailboxes. Greg
(BIDLOW LTD, sole employee, not a coder) built it and is paid to run it. Real mail
reaches real strangers, so a mistake costs a client relationship.

## What is running, and how Greg controls it

None of this goes through Cowork. It is PowerShell on Greg's Windows machine and
keeps running whether or not any Claude task is open.

| To do this | Double-click |
|---|---|
| Start or restart the relay | `relay-start.cmd` |
| See what the relay is doing | `relay-status.cmd` |
| See all projects at a glance | `_standards\deck.cmd` |
| Stop it | close the window, or create a file called `HALT` in `.bidlow\relay\` |

The relay takes the next row from `.bidlow/relay/QUEUE.md`, hands it to Claude
Code, and merges to production on green CI. It runs ~25 cycles a night unattended.
The model it uses is pinned in `.claude/settings.json` (currently `sonnet`).

## Where things stood on 2026-08-29

**Grades.** Engineering 8.5. Customer-ready 7.56. Sell gate NOT satisfied — it
needs customer-ready at 8.0.

**Nine of the ten customer-ready blockers are now closed.** CR-01, CR-02, CR-03,
CR-04, CR-05, CR-06, CR-07, CR-01b and CR-09. Only **CR-08** remains open: a raw
correlation id is shown ungated on the outbound email detail page. Note that
closing it may not on its own carry the score to 8.0 — the total is weighted, so
re-measure rather than assume.

**Shipped and live on production this week**, all hash-verified rather than
claimed: three-tier client grading with on-screen signatures; the four-at-a-time
send gate for corporate clients; the machine-or-human sending switch, three-state
so an undecided client refuses; tracking that verifies the customer's DNS itself
rather than trusting a tick-box; public privacy and terms pages; the seven-day
Google reconnect countdown and its day-five alarm; and a Connect button that no
longer destroys a working mailbox credential before sign-in.

**Two findings worth remembering**, because both were invisible until measured:
the open-tracking pixel had never recorded a single open (it sat behind the login,
so every request bounced to sign-in), and only 27 of 55 live mailboxes could
actually send — including OpensDoors' own, dark for 56 days — while the daily
digest reported "nothing to reconnect" because it filtered on Google only.

## What is waiting on a human, and on whom

1. **Train Hugger's do-not-contact list.** Their sheet was rebuilt, not edited —
   291 unique domains against the 373 we hold, sharing only 109. Syncing it would
   unblock 265 companies including the BBC, Barclays, AstraZeneca, Network Rail,
   TfL and twelve NHS organisations. Nothing has been deleted. Greg must ask Train
   Hugger whether the sheet as it stands is authoritative. Evidence:
   `_odoutreach-handover\train-hugger-dnc-review.html`. Queue row 48, BLOCKED.
2. **Eight stranded mailboxes** need a person at each client to sign in again.
   Queue row 84, BLOCKED.
3. **Tuesday 1 September**, Greg is on site with Train Hugger's staff reconnecting
   five mailboxes, and presenting. Deck material:
   `_odoutreach-handover\DECK-NOTES-TUESDAY.md`.
4. **The Google app stays unpublished** — the owner's decision, not to be
   re-argued. They reconnect by hand every seven days until the system is proven.
   `_odoutreach-handover\GOOGLE-7-DAY-MANUAL-POLICY.md`.
5. **Phase two is built but not paid for.** The signable schedule is
   `_odoutreach-handover\ODoutreach-phase-two-schedule.docx`, with blanks for the
   price. Greg's approach: build it visible so the owner sees the value, and the
   features go dark if he does not sign.

## The habit that keeps costing time

A queue row that becomes BLOCKED on a human **must be moved to the back of the
table**, still blocked. The picker refuses to walk past a blocked row — correctly,
the order is the plan — so one question left at the front holds every other job
still. That has caused three separate stalls. Both current blocked rows are
already parked at the back.

## When the queue empties

It did twice on 29 August. The relay does not invent work; it idles. Check
`relay-status.cmd`, and queue the next block rather than leaving it running dry.
