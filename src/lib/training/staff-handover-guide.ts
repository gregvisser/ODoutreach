export type StaffHandoverSection = {
  title: string;
  bullets: readonly string[];
};

export const STAFF_HANDOVER_TITLE = "ODoutreach Staff Training Guide";

export const STAFF_HANDOVER_AUDIENCE =
  "OpensDoors staff using ODoutreach to manage client email outreach safely.";

export const STAFF_HANDOVER_SECTIONS: readonly StaffHandoverSection[] = [
  {
    title: "What ODoutreach does",
    bullets: [
      "ODoutreach keeps each client workspace, sending inbox, contact list, do-not-contact list, outreach sequence, and reply timeline in one place.",
      "Use it to prepare safe outreach, send from connected client mailboxes, and check replies without working from personal spreadsheets.",
    ],
  },
  {
    title: "Daily workflow checklist",
    bullets: [
      "Open the client workspace and check the Overview.",
      "Check Mailboxes for reconnect warnings and daily capacity — any staff member can reconnect a mailbox or set its signature (including the one-click Set branded signatures button) directly from this page.",
      "Import contacts from CSV or RocketReach in Sources only when you are ready to save them to a list; each import is also deduplicated into the global Universe.",
      "Check Do-not-contact before any outreach.",
      "Build one introduction email; add follow-ups only if needed.",
      "After saving a sequence, wait for Saved or Updated, then choose Open saved sequence. Saving a draft does not send emails.",
      "If the save result is uncertain, use Refresh sequence list and check whether your changes were saved before trying again. Do not create another copy blindly.",
      "Choose Auto-pick or a specific connected mailbox.",
      "Preview and review before sending or scheduling.",
      "Use Check replies on Mailboxes if you need a fresh check, then open Activity to read the replies. If more messages remain, check again.",
      "Matched replies stop their sequence follow-ups automatically. Open the reply detail to confirm it says Stopped; use Stop follow-ups if it has not stopped.",
    ],
  },
  {
    title: "Client setup",
    bullets: [
      "Open Clients and choose Add client, or use New client in the sidebar. Normal OpenDoors staff can create their own client workspaces.",
      "Complete the Brief with business profile, target audience, offer, exclusions, and compliance notes.",
      "Choose Save brief, wait for Brief saved, then choose Open saved brief and check that your entries remain. Saving a brief does not send email.",
      "If a brief save cannot be confirmed, keep the original page open. Open saved brief opens a separate tab so you can check the saved version without losing the original entries. Do not repeat the save blindly.",
      "If address or audience suggestions are unavailable, enter the address manually or type an audience entry and choose Add. Start a new editing session from a freshly opened page; preserve any unsaved text before refreshing an older page.",
      "Any staff member can connect mailboxes, set branded signatures/disclaimers, and send an internal verification email from Mailboxes — connection status and capacity are visible to everyone on the workspace.",
    ],
  },
  {
    title: "Contacts, Universe, and RocketReach",
    bullets: [
      "CSV import runs from the client workspace Sources tab (preview, then confirm).",
      "RocketReach searches use live credits and require typing SEARCH ROCKETREACH before the search runs.",
      "Imported contacts appear in the client list you chose and as individual people in Universe for reuse.",
      "Use Universe to filter people and create another client list without re-importing the file.",
      "Deleting a client list does not delete Universe contacts.",
      "Do-not-contact rules apply before outreach sends.",
    ],
  },
  {
    title: "Do-not-contact",
    bullets: [
      "Do-not-contact lists can block email addresses, domains and company names. Exact company names block outreach; similar names and missing employer details may require review.",
      "Keep the Google Sheets current and check last sync before sending.",
      "Removing a company name from its sheet does not remove the existing block. A refused sheet removal needs review; do not delete a block just to make a sync or send succeed.",
      "Clear removal requests are blocked automatically when the reply is processed. Check the reply detail or Blocked contacts to confirm the block. If no block is recorded, use the immediate Do-not-contact action; do not wait for a sheet sync.",
    ],
  },
  {
    title: "Outreach",
    bullets: [
      "Start with one introduction email. Follow-ups are optional.",
      "Choose a contact list and a sending mailbox. Broken mailboxes are disabled with a reason.",
      "Nothing should be sent until you have reviewed the list, mailbox, message, and do-not-contact status.",
      "Human sending includes scheduled emails that staff have reviewed and approved. It does not require Machine sending.",
      "If an email is held for review, open Email approvals and read the recipient, sender, message and any recent contact from another client. Approve only when another email is appropriate.",
      "In Email approvals, choose Next allowed sending time or Choose a later sending time. A later time is entered in UK time (Europe/London); check the displayed UTC equivalent. Changing the time requires a fresh review tick.",
      "After approval, check the saved earliest attempt in Activity. The worker may send later because of sending hours, warm-up, allowance or safety holds. Queued is not Sent, and Sent does not prove Inbox placement. An uncertain approval needs a status check before any further action.",
      "Each mailbox has its own ceiling of 30 total emails per day, including staff replies and reserved sends. One mailbox filling up does not reduce another mailbox sending the same sequence. Warm-up can allow fewer outreach emails; the displayed capacity is not a promise that all 30 can go out immediately.",
      "Recipients waiting on pacing or that ceiling send automatically. Do not launch again to clear pacing, and do not ask the client to approve the wait. Do-not-contact, unsubscribe, bounce, a reply that stops the sequence, a pause, and a disconnected mailbox stay held.",
      "Automatic follow-ups require Machine sending and an active scheduler. In Human sending, review due recipients and use the follow-up send control for the first launch. Do not change sending mode just to clear a hold.",
    ],
  },
  {
    title: "Replies and Activity",
    bullets: [
      "The live system checks connected mailboxes automatically. Use Check replies on Mailboxes for a fresh check and review Activity daily; a disconnected mailbox cannot be checked until it is reconnected.",
      "Activity shows sent messages, inbound replies, errors, unsubscribes, and sequence progress.",
      "If a mailbox says reconnect required, Microsoft or Google needs the mailbox owner/admin to sign in again.",
    ],
  },
  {
    title: "Signatures and unsubscribe links",
    bullets: [
      "ODoutreach should store the full official outreach signature and disclaimer on each mailbox.",
      "The final ODoutreach-controlled order is message body, full signature/disclaimer, then Unsubscribe.",
      "If Microsoft or Google injects extra signatures after sending, an administrator must disable that provider-side injection or copy the full content into ODoutreach.",
    ],
  },
  {
    title: "Admin operations (off the sidebar by design)",
    bullets: [
      "Normal staff use Overview, Brief, Mailboxes, Setup help, Do-not-contact, Sources, Lists, Templates, Outreach, Email approvals, Activity, and Training.",
      "Admin Operations is for support troubleshooting of queues, failures, and delivery infrastructure. It is intentionally not in the sidebar and is reached from internal links and from action-redirect targets in the outbound flow.",
      "Do not requeue or change technical state unless you understand the failed record.",
    ],
  },
  {
    title: "Safety rules",
    bullets: [
      "Do not send without checking the contact list and do-not-contact state.",
      "Do not use disconnected or reconnect-required mailboxes.",
      "Do not import RocketReach contacts unless the search and destination list are correct.",
      "Check replies daily so interested prospects and unsubscribe requests are not missed.",
    ],
  },
  {
    title: "Glossary",
    bullets: [
      "Client: one customer workspace.",
      "Universe: shared cross-client directory of individual people from imports; reuse them to build client lists.",
      "List: a named selection of contacts inside one client workspace (the unit a sequence sends to).",
      "Contact: a person record in a client list (often linked from Universe).",
      "Sending inbox/mailbox: a connected Microsoft or Google mailbox used for outreach.",
      "Sequence: an introduction email plus optional follow-ups.",
      "Do-not-contact: email addresses, domains and company names blocked from outreach. Use Blocked contacts for the email/domain directory and the client's Do-not-contact page for company names.",
      "Activity: timeline of sends, replies, errors, and mailbox inbox messages.",
      "Reports: recorded sends, replies, bounces and opt-outs. A confirmed send means the mailbox accepted the message; it does not prove inbox delivery.",
    ],
  },
  {
    title: "10-minute handover script",
    bullets: [
      "Open OpensDoors, show Overview and the client tabs (Brief, Mailboxes, Setup help, Do-not-contact, Sources, Lists, Templates, Outreach, Email approvals, Activity).",
      "Show Mailboxes, capacity, signatures, and reconnect warning states. Read the explainer card.",
      "Show Sources import choices, Universe, and explain RocketReach credits and the confirmation phrase requirement.",
      "Show Do-not-contact (titled \"People blocked from outreach\" at the cross-client view) and explain why it is a hard safety check.",
      "Show Outreach: choose list, mailbox, introduction, optional follow-up, preview, send/schedule.",
      "Show how a held email is reviewed in Email approvals and how its earliest sending time appears in Activity. During training, do not approve a real email unless that particular send is intended and authorised.",
      "On Mailboxes, use Check replies, then open Activity and read a reply. Show its stopped sequence and, for an opt-out, its recorded contact block.",
      "Explain that Admin operations is support-only and not in the sidebar.",
    ],
  },
  {
    title: "Connect or reconnect a mailbox",
    bullets: [
      "Open the client, then Mailboxes, and choose Add mailbox. Enter the sending address, choose Microsoft 365 or Google, and Save. Saving the row does not send email.",
      "On that row choose Connect. A Microsoft 365 or Google sign-in window opens. The person who can sign in to that mailbox finishes the prompt. They do not need an ODoutreach login.",
      "Reconnect is the same sign-in when the row says connection error or reconnect required. Google mailboxes that need a fresh sign-in are also listed under Google logins in the sidebar.",
      "If Microsoft asks an administrator to approve the app, open the client's Setup help tab and use the admin-consent link for that domain. Connecting does not send email and does not touch contacts.",
      "After it reads Connected, set the signature. Google Workspace can use Sync from Gmail. Microsoft 365 does not expose the signature, so use Set signature or Set branded signatures. A mailbox with no signature cannot launch.",
      "Settings is not where you connect a mailbox. Connect and reconnect happen on the client's Mailboxes tab.",
    ],
  },
  {
    title: "Add a client",
    bullets: [
      "Any OpensDoors staff member can add a client. Use New client in the sidebar, or Clients and then Add client.",
      "Enter the business name and details, then Create workspace. You land on Overview. The tabs are Overview, Brief, Mailboxes, Setup help, Do-not-contact, Sources, Lists, Templates, Outreach, Email approvals, and Activity.",
      "Complete the Brief and choose Save brief. Saving a brief does not send email. The workspace stays ONBOARDING until Launch readiness is complete, then it becomes ACTIVE on the next visit to Overview.",
    ],
  },
  {
    title: "Import contacts from a CSV",
    bullets: [
      "Open the client's Sources tab. CSV import is preview, then confirm. Preview does not save anyone. Confirm writes the rows.",
      "Every confirmed import is added to the client list you chose and, as individual people, to Universe. Universe deduplicates, mainly by email.",
      "Check the rows on Lists, or across clients in Universe. Do-not-contact still applies before any send.",
    ],
  },
  {
    title: "Import contacts from RocketReach",
    bullets: [
      "Import contacts from RocketReach on the client's Sources tab, in the RocketReach card. A search can spend RocketReach credits.",
      "Type the confirmation phrase SEARCH ROCKETREACH before the search runs. Choose a destination list. The industry filter, when you use one, must be a name from that card's industry list.",
      "Imported people land on the list you chose and in Universe. The import does not enrol them in a sequence and does not send email.",
    ],
  },
  {
    title: "Use Universe and lists",
    bullets: [
      "Universe is in the sidebar. It is the shared directory of people from imports. Filter, sort, and choose visible columns, then create a client list from the selection.",
      "A list belongs to one client. Open it from the client's Lists tab. A sequence sends to exactly one list.",
      "Deleting a list does not delete the people from Universe. Do-not-contact still blocks a send.",
    ],
  },
  {
    title: "Templates, sequences, follow-ups, and launch",
    bullets: [
      "Write and approve emails on the Templates tab. Do not type a signature into the body: the mailbox signature is appended when the email sends. Unknown placeholders block approval.",
      "Build the sequence on Outreach. One Introduction step is enough. Add a follow-up only when you want one. Choose the list and either auto-pick or one connected mailbox. Saving a sequence does not send.",
      "Preview the subject, body, signature, and recipients before launch. Launch queues eligible emails. It does not mean every email leaves immediately.",
      "In Human sending, the first launch of a follow-up is yours. Open Outreach and launch follow-up steps that are due. Do not turn on Machine sending just to clear a hold. Only the internal BidlowAI workspace is set up for Machine sending.",
      "A matched reply stops further follow-ups on that sequence. Open the reply and confirm it says Stopped. Use Stop follow-ups if it has not stopped.",
    ],
  },
  {
    title: "Add a follow-up step",
    bullets: [
      "Open the client, then Outreach, and open the sequence. One Introduction step is enough.",
      "Choose Add follow-up to add a follow-up step. Set the delay for that step. Saving the sequence does not send email.",
      "In Human sending, you launch a due follow-up step from Outreach. Do not turn on Machine sending just to clear a hold. Only the internal BidlowAI workspace is set up for Machine sending.",
    ],
  },
  {
    title: "Pacing and the word Queued",
    bullets: [
      "Queued is not Sent. Sent means the mailbox accepted the message. Sent does not prove the message reached the inbox.",
      "Recipients held only for pacing, the sending window, or a mailbox's own daily capacity stay Queued and send automatically on a later run. Do not launch the sequence again to clear that queue, and do not ask the client to approve the wait.",
      "Each mailbox has its own ceiling. One mailbox filling up does not reduce another mailbox on the same sequence.",
      "Do-not-contact, unsubscribe, bounce, a reply that stops the sequence, a pause, and a disconnected mailbox stay held. Those are not pacing, and they do not send automatically.",
    ],
  },
  {
    title: "Read replies",
    bullets: [
      "Replies to answer, in the sidebar, is the queue of replies still waiting on a person, across clients. Claim a reply by opening it.",
      "Connected mailboxes are checked automatically. Use Check replies on the client's Mailboxes tab when you want an extra pull. Then read the message on Activity or on the reply itself.",
      "A disconnected mailbox cannot be checked until someone reconnects it. Answer from ODoutreach so the reply stays on the same mailbox and thread.",
    ],
  },
  {
    title: "Do-not-contact and blocked contacts",
    bullets: [
      "Do-not-contact fails closed. An address, domain, or exact company name on the block list is not emailed. A similar company name or a missing employer can require review rather than a send.",
      "The per-client tab is Do-not-contact. The cross-client page is Blocked contacts in the sidebar, titled People blocked from outreach.",
      "Keep the Google Sheets shared with the service account and check that the last sync succeeded before a new send. Removing a name from the sheet does not clear a block that is already stored. Do not delete a block to make a sync or a send succeed.",
      "A clear removal request in a reply is blocked when the reply is processed. If no block is recorded, use the immediate Do-not-contact action. Do not wait for a sheet sync, and do not use the allow-again confirmation unless Greg Visser has agreed.",
    ],
  },
  {
    title: "Raise or resolve a support ticket",
    bullets: [
      "Open Support in the sidebar. Give the ticket a short title and describe what you were doing, what you expected, and what happened. You can attach up to three screenshots (PNG, JPG, GIF, or WEBP, 5MB each).",
      "If the How do I bar at the top of the app cannot answer, it offers Raise a support ticket. That creates the same kind of ticket and includes the question you asked.",
      "Use a ticket for a bug, a stuck queue, or a step you cannot complete. Do not requeue mail or change a do-not-contact block to work around it.",
      "To resolve a support ticket, open it from Support in the sidebar. Anyone can open a ticket. Only the owner account can resolve and close it.",
      "Write a resolution note of at least 10 characters explaining what was fixed. The reporter reads that note. Then choose Resolve & close.",
      "Once the ticket is resolved, the owner account can choose Reopen ticket on the same page.",
    ],
  },
  {
    title: "Save a research plan",
    bullets: [
      "Research plans are on the client's Sources tab, under Prospect research plans. Enter job titles and regions one per line. Seniority is optional. Industries must be chosen from the RocketReach industry list — the same names as the RocketReach card. A typed industry that is not on that list cannot be saved.",
      "Save research draft stores the plan only. It does not search, spend credits, import contacts, or send email.",
      "Run plan into list uses the same RocketReach search, the same SEARCH ROCKETREACH confirmation, and the same cap as the card. It does not enrol anyone and it does not send email.",
    ],
  },
  {
    title: "Preview a list top-up",
    bullets: [
      "Automatic list top-up is off until a named member of staff turns it on for that sequence. Greg Visser is the approver. It also needs the server setting for automatic refill, an Active client, and Machine sending. It adds people to the sequence's list. It does not enrol them and it does not send email.",
      "Preview top-up is a dry run. It shows how many matching people are already in Universe and about how many RocketReach credits the shortfall would take. It does not spend credits and it does not add contacts.",
      "If a saved plan names an industry that is not on the RocketReach list, preview skips that industry and says so. It still does not spend credits. Save a new plan with industry names from the RocketReach card before a real run.",
    ],
  },
  {
    title: "AI drafts, review, send times, and sender comparison",
    bullets: [
      "Product AI runs on xAI Grok. A draft or a review on its own does not send email, and open tracking stays off. An AI campaign is the separate path that can send, and only after its own writing check.",
      "On Templates, Draft emails with AI writes a sequence of draft emails from the client brief. Each draft stays unapproved until a person reads it. Nothing sends until that person approves it and someone launches from Outreach.",
      "On Outreach, Review with AI scores one campaign's writing. Work out our best send times reads this client's sent emails and the replies linked to them, by weekday and hour. Compare campaigns by job title does the same from people who were actually sent a campaign. Compare our senders is on Outreach and on Mailboxes. It compares mailboxes, not people, using sent emails and linked replies.",
      "If there is not enough sent mail or not enough replies, those panels say how many were sent and stop. They do not guess, and that check does not spend AI credits. Bounces and replies are outcomes. Opens are not used.",
    ],
  },
  {
    title: "Start an AI campaign",
    bullets: [
      "Open the client's Outreach page and use Create AI campaign. The brief is filled in from the client brief. Suggest filters from the brief fills job titles, countries, and industries. Industries must be names from the RocketReach list. Company size is optional and is given to the writer. The RocketReach search uses job title, industry, and country.",
      "Set how many people to contact, the RocketReach credit budget in total and per day, and an optional end date. Read what the machine will do. Type START AI CAMPAIGN and press Start AI campaign. That is the only confirmation. The client is not asked to approve anything.",
      "The machine finds this client's own people first, then uses RocketReach for the shortfall inside the budget. People already known are skipped before a credit is spent. It adds people who pass the same checks as Review recipients: do-not-contact, unsubscribe, suppression, and same-client. You do not open Review recipients for an AI campaign. It writes the emails with xAI Grok and checks them. A low score is rewritten. If it stays low, nothing is sent and a member of staff is told.",
      "Sending uses the same path as a campaign you send by hand. Do-not-contact, unsubscribe, suppression, and same-client checks stay blocked. Each mailbox keeps its own daily limit. A disconnected mailbox pauses only that mailbox. Open tracking stays off. A reply stops further emails to that person. You handle replies. Sequences you still send by hand still use Review recipients.",
      "Pause, resume, or stop from the campaign page. Type PAUSE AI CAMPAIGN, RESUME AI CAMPAIGN, or STOP AI CAMPAIGN. This does not change campaigns you still send by hand, and it does not turn on Machine sending for the client.",
    ],
  },
];
