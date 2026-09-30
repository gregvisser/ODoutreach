# ODoutreach — staff daily checklist

One page for OpensDoors staff. Run through this every working day before you treat outreach as “done”.

## 1. Replies queue (first)

- Open **Replies waiting for a person** in the sidebar (`/replies`).
- Work the list top to bottom. Open each reply, read it, and respond or mark it handled.
- **Claim** replies by opening them — colleagues see who is working on what.
- Do not leave replies sitting in **Waiting too long** (the amber summary at the top). Those are past the time we said we would answer.
- Replies are fetched automatically from connected mailboxes (Azure WebJob). You do not need to press **Check replies** every day unless you want a fresh pull from Mailboxes.

## 2. Follow-ups (Human sending clients)

- Almost every OpensDoors customer workspace uses **Human sending** on the Overview.
- Only the internal **BidlowAI** test workspace is set up for **Machine sending** (automated follow-ups). Do not change other clients to Machine sending without Greg’s agreement.
- In **Human sending**, the **first** launch of a follow-up is still yours. Each day, open each active client’s **Outreach** tab and launch follow-up steps that are due and have not been launched. After that launch, a recipient held only for pacing or mailbox capacity sends automatically — do not launch again to clear it.
- Matched replies still **stop** further follow-ups on that sequence automatically — check the reply detail shows follow-ups stopped.

## 3. Mailboxes and sending

- Open each client you are actively sending for → **Mailboxes**.
- Fix any **Reconnect** warning by asking the mailbox owner to sign in again (Microsoft or Google). Disconnected mailboxes cannot send or receive checks.
- Glance at daily capacity and warm-up — the “30 per day” ceiling is **per mailbox** and includes staff replies and reserved sends. One mailbox filling up does not reduce another. You do not relaunch a sequence to free capacity; waiting recipients send automatically. Do-not-contact and a disconnected mailbox stay held.

## 4. Do-not-contact and “List held”

- Before any new send, confirm do-not-contact is in good shape (sheet synced, blocks make sense).
- If sync status shows **List held — sending continues** (amber), the system is **keeping extra blocks in place** because the Google Sheet is shorter than what we already hold. **Sending continues**; those people stay blocked, which is the safe default.
- Do **not** press **Yes — allow … to be contacted again** (the destructive confirmation on Do-not-contact) unless Greg Visser has agreed the sheet is correct and those contacts should truly be unblocked.

## 5. AI features (sparkle icon)

- Sparkle-marked features (**draft sequence**, **review campaign**, send-time advice, job-title fit, and **Compare our senders** on Outreach and Mailboxes) only **draft or advise**. They do not send email by themselves. Those counts use emails that were actually sent and the replies linked to them. Open tracking is off, so opens are not used.
- Every AI draft on Templates still needs a **person** to read, edit if needed, and approve before a hand-sent sequence goes out.
- **How do I start an AI campaign?** On the client's Outreach page, open **Create AI campaign**, read what the machine will do, and type **START AI CAMPAIGN**. That one confirmation is enough. The machine finds people, adds the ones who pass do-not-contact, unsubscribe, suppression, and same-client checks, writes, checks the writing, and sends. You do not open **Review recipients** for an AI campaign. You handle replies. Sequences you still send by hand still use Review recipients. Do not turn on Machine sending for the client to get this. Pause or stop from the campaign page. A writing score that stays under 75 is the stop that waits for a person. If the writing service is busy or slow, the machine waits and tries again on its own.


- **Automatic reply labels** are off for prospect replies — the Replies queue will not sort warm leads for you; read the messages yourself.
- Product AI uses **xAI Grok** when enabled; it is not OpenAI or Anthropic in production.

## 6. When something is wrong

- Raise a **Support** ticket from the app (or via Training assistant **Raise a support ticket**) for bugs, stuck queues, or anything you do not understand.
- **Greg Visser** is the project lead and the only approver for unusual actions (unblocking do-not-contact shrinks, Machine sending, governance exceptions, and similar). Neither OpensDoors customers nor their prospects sign off anything in ODoutreach.

## Quick links

- Printable training guide: `/training/staff-handover`
- Full handover notes: [ODOUTREACH_STAFF_HANDOVER_GUIDE.md](./ODOUTREACH_STAFF_HANDOVER_GUIDE.md)
