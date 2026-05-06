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
      "Check Mailboxes for reconnect warnings and daily capacity.",
      "Import contacts from CSV or RocketReach only when you are ready to save them to a list.",
      "Check Do-not-contact before any outreach.",
      "Build one introduction email; add follow-ups only if needed.",
      "Choose Auto-pick or a specific connected mailbox.",
      "Preview and review before sending or scheduling.",
      "Open Activity and click Check replies for the connected mailboxes.",
    ],
  },
  {
    title: "Client setup",
    bullets: [
      "Create a client from Clients -> New client.",
      "Complete the Brief with business profile, target audience, offer, exclusions, and compliance notes.",
      "Use Mailboxes to check sender names, signatures, capacity, and reconnect prompts.",
    ],
  },
  {
    title: "Contacts and RocketReach",
    bullets: [
      "CSV import has a preview step before saving.",
      "RocketReach searches use live credits and require the confirmation phrase before the API is called.",
      "Imported contacts appear in the selected client list, and do-not-contact rules apply after import.",
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
    title: "Admin operations",
    bullets: [
      "Normal staff should use Overview, Contacts, Outreach, Activity, and Training.",
      "Admin operations is for support troubleshooting of queues, failures, and delivery infrastructure.",
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
      "Contact: a person or company record in a client list.",
      "Sending inbox/mailbox: a connected Microsoft or Google mailbox used for outreach.",
      "Sequence: an introduction email plus optional follow-ups.",
      "Do-not-contact: emails and domains excluded from outreach.",
      "Activity: timeline of sends, replies, errors, and mailbox inbox messages.",
    ],
  },
  {
    title: "10-minute handover script",
    bullets: [
      "Open OpensDoors, show Overview and the client tabs.",
      "Show Mailboxes, capacity, signatures, and reconnect warning states.",
      "Show Contacts import choices and explain RocketReach credits.",
      "Show Do-not-contact and explain why it is a hard safety check.",
      "Show Outreach: choose list, mailbox, introduction, optional follow-up, preview, send/schedule.",
      "Show Activity: click Check replies and read inbound messages.",
      "Explain that Admin operations is support-only.",
    ],
  },
];
