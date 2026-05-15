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
      "Check Mailboxes for reconnect warnings and daily capacity — the page shows connection status; full signatures are configured by administrators.",
      "Import contacts from CSV or RocketReach in Sources only when you are ready to save them to a list; each import is also deduplicated into the global Universe.",
      "Check Do-not-contact before any outreach.",
      "Build one introduction email; add follow-ups only if needed.",
      "Choose Auto-pick or a specific connected mailbox.",
      "Preview and review before sending or scheduling.",
      "Open Activity and click Check replies for the connected mailboxes.",
      "Open the reply detail and click Stop follow-ups so the sequence ends for anyone who has replied.",
    ],
  },
  {
    title: "Client setup",
    bullets: [
      "Create a client from Clients -> New client.",
      "Complete the Brief with business profile, target audience, offer, exclusions, and compliance notes.",
      "Administrators configure connected mailboxes, full branded signatures/disclaimers, and proof sends from Mailboxes (advanced); operators review connection status and capacity.",
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
      "Do-not-contact lists contain email addresses and domains that must never receive outreach.",
      "Keep the Google Sheets current and check last sync before sending.",
      "If someone replies asking to be removed, add them to the do-not-contact source.",
    ],
  },
  {
    title: "Outreach",
    bullets: [
      "Start with one introduction email. Follow-ups are optional.",
      "Choose a contact list and a sending mailbox. Broken mailboxes are disabled with a reason.",
      "Nothing should be sent until you have reviewed the list, mailbox, message, and do-not-contact status.",
    ],
  },
  {
    title: "Replies and Activity",
    bullets: [
      "Replies are checked manually using Check replies unless automatic sync has been enabled.",
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
      "Normal staff use Overview, Brief, Mailboxes, Sources, Lists, Do-not-contact, Templates, Outreach, Activity, and Training.",
      "Admin Operations is for support troubleshooting of queues, failures, and delivery infrastructure. It is intentionally not in the sidebar (removed in PR #135) and is reached from internal links and from action-redirect targets in the outbound flow.",
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
      "Do-not-contact: emails and domains blocked from outreach (titled \"People blocked from outreach\" at the cross-client view).",
      "Activity: timeline of sends, replies, errors, and mailbox inbox messages.",
      "Reports: live operational dashboard — Sent, Delivered, Replies, Bounces, Opt-outs.",
    ],
  },
  {
    title: "10-minute handover script",
    bullets: [
      "Open OpensDoors, show Overview and the client tabs (Brief, Mailboxes, Sources, Lists, Do-not-contact, Templates, Outreach, Activity).",
      "Show Mailboxes, capacity, signatures, and reconnect warning states. Read the explainer card.",
      "Show Sources import choices, Universe, and explain RocketReach credits and the confirmation phrase requirement.",
      "Show Do-not-contact (titled \"People blocked from outreach\" at the cross-client view) and explain why it is a hard safety check.",
      "Show Outreach: choose list, mailbox, introduction, optional follow-up, preview, send/schedule.",
      "Show Activity: click Check replies and read inbound messages. Show Stop follow-ups on a replied contact.",
      "Explain that Admin operations is support-only and not in the sidebar.",
    ],
  },
];
