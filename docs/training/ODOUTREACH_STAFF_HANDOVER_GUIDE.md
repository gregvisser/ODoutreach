# ODoutreach Staff Training Guide

Audience: OpensDoors staff using ODoutreach.

ODoutreach helps OpensDoors create a client workspace, connect sending inboxes, import contacts safely into a **global Universe** (deduplicated) and **client-specific lists**, run outreach sequences, and check replies in one place.

## Universe vs client lists

- **Universe** (sidebar): shared OpensDoors contact warehouse. Every CSV and RocketReach import is added here automatically, deduplicated (primarily by email), with source attribution.
- **Client list**: belongs to one workspace. Sequences send to exactly one client list.
- **Reuse across clients**: in Universe, select contacts → choose target client → create a list → use that list in Outreach for that client. Do-not-contact still applies before sends.

## Daily workflow checklist

See **[Staff daily checklist](./STAFF-DAILY-CHECKLIST.md)** for the one-page routine OpensDoors staff should run every working day.

At a high level:

1. Work **Replies waiting for a person** (sidebar) — claim and answer replies; do not leave rows in **Waiting too long**.
2. Check Mailboxes (connection status and capacity — signature setup is available to all staff on the Mailboxes page).
3. Import contacts (Sources / Contacts) when needed; confirm rows in **Universe** or **Contacts**.
4. Check Do-not-contact.
5. For **Human sending** clients (every OpensDoors customer workspace except the internal **BidlowAI** test client on Machine sending), review the Outreach tab for follow-up steps that are ready and launch them — follow-ups do not send by themselves in Human sending.
6. Build or adjust sequences, preview, send or schedule introductions as needed.
7. Scan Activity for errors, unsubscribes, and sequence progress.

## Staff handover sections

1. What ODoutreach does
2. Daily workflow checklist
3. Dashboard overview
4. Creating a new client
5. Completing the client brief
6. Checking sending inboxes/mailboxes
7. Understanding mailbox status
8. Signatures and unsubscribe links
9. Importing contacts from CSV (also lands in Universe)
10. Importing/searching with RocketReach (also lands in Universe)
11. **Universe** — global deduplicated warehouse; create client lists from here
11. Do-not-contact lists
12. Building an outreach sequence
13. Choosing a sending mailbox
14. Writing an introduction email
15. Adding optional follow-ups
16. Previewing before send
17. Sending/scheduling outreach
18. Checking replies
19. What to do when a mailbox needs reconnect
20. What Activity shows
21. Reports
22. Admin operations: when to use and when not to use
23. Troubleshooting
24. Safety rules
25. Glossary
26. Quick handover script

## Common tasks the How do I bar can answer

The in-app assistant searches this guide's task sections. The short version:

- **Connect a mailbox:** Mailboxes → Add mailbox → Microsoft 365 or Google → Save → Connect. The mailbox owner finishes the sign-in. Reconnect is the same step. Google logins in the sidebar lists Google mailboxes that need a fresh sign-in. Setup help has the Microsoft admin-consent link.
- **Add a client:** New client in the sidebar. Tabs include Email approvals between Outreach and Activity.
- **CSV:** Sources → preview, then confirm. Rows land on the chosen list and in Universe.
- **RocketReach:** Sources card, type SEARCH ROCKETREACH. Industries must be names from that card's list.
- **Research plan:** Sources → Prospect research plans. Industries are picked from the RocketReach list and cannot be saved otherwise. Saving does not search or spend credits.
- **Preview top-up:** a dry run on Outreach. It does not spend credits. An industry that is not on the RocketReach list is skipped and named. Automatic top-up stays off until a named member of staff turns it on. Greg Visser approves it.
- **Queued:** not Sent. Pacing and mailbox capacity send later on their own. Do-not-contact, unsubscribe, bounce, reply-stop, pause, and a disconnected mailbox stay held.
- **Do-not-contact fails closed.** Do not delete a block to force a send.
- **AI:** xAI Grok only. A draft or a review on its own does not send. An AI campaign is separate: on Outreach, type START AI CAMPAIGN once. The machine finds people, writes, checks, and sends. You handle replies. Best send times, job-title fit, and sender comparison count emails that were actually sent and the replies linked to them. Open tracking is off, so opens are not used. Compare our senders is on Outreach and on Mailboxes.

## Key limitations

- **Replies** are collected automatically from connected mailboxes (Azure WebJob in production; the GitHub **Sync replies** workflow also refreshes do-not-contact sheets). Use **Check replies** on Mailboxes only when you need an extra pull; you do not need to sync manually for ordinary daily work.
- **Open tracking** is off by design — Activity does not show opens as a deliverability signal.
- **Mailbox capacity is per mailbox.** Each connected mailbox sends up to its own daily cap. Recipients waiting on pacing or that cap send automatically; staff do not launch again to clear them. Do-not-contact, unsubscribe, bounce, reply-stop, pause, and a disconnected mailbox stay held. Do not ask the client to approve a wait.
- **Product AI** (sparkle icon on drafting and review features) runs on **xAI Grok** when enabled. A draft or a review on its own does not send mail. An **AI campaign** can send, and only through the normal send path after its writing check. Optional outreach AI needs `AI_OUTREACH_FEATURES` turned on. AI campaigns also need `AI_CAMPAIGNS_ENABLED`. See `docs/ops/AI-CAMPAIGNS.md`.
- **Automatic reply labels** (AI sorting on the Replies queue) are not in use for prospect data — replies arrive unlabelled and need a person to read them.
- Mailboxes marked **reconnect required** cannot send until the mailbox owner signs in again through Microsoft or Google.
- RocketReach search uses live credits; do not search or import without a clear operator confirmation.

## Safety rules

- Do not send without checking the contact list.
- Do not use disconnected mailboxes.
- Check Do-not-contact before outreach.
- Check replies daily.
- Do not use the do-not-contact **Yes — allow … to be contacted again** confirmation without checking with Greg Visser first.
- Use Admin operations only for delivery support.

## 10-minute handover script

1. Open the client Overview and explain the workspace status (ONBOARDING until Launch readiness is complete, then ACTIVE automatically).
2. Open Mailboxes and check connected inboxes and capacity (branded signatures can be set on Mailboxes, including the one-click **Set branded signatures** action).
3. Open **Contacts / Sources** and the **Universe** tab; explain CSV/RocketReach imports and deduplication.
4. Open Do-not-contact and explain emails/domains never to contact; mention **List held — sending continues** when a sheet shrink is refused.
5. Open Outreach and show list, mailbox, introduction, optional follow-up, preview, send. Human sending follow-ups still need a first manual launch. After that, pacing and mailbox-capacity waits send on their own — each mailbox up to its own daily cap, and staff do not launch again to clear them. Do-not-contact stays blocked.
6. Open **Replies waiting for a person** in the sidebar and show how to open and work a reply.
7. Open Training and show the printable guide at `/training/staff-handover` plus the module list.
