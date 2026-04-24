/**
 * Static training content for the OpensDoors Outreach portal.
 *
 * Pure data — no database reads/writes, no email sends, no imports, no
 * suppression sync, no OAuth. Every module follows the same seven-section
 * structure so operators learn every page the same way:
 *
 *   1. Purpose           — what this portal page is for
 *   2. Screenshots       — what the page looks like in production
 *   3. Steps             — what to do, in order
 *   4. What good looks like
 *   5. Common mistakes to avoid
 *   6. What to do next
 *   7. Portal link       — deep-link to the real page
 *
 * The worked example throughout is always the same client — OpensDoors
 * onboarding OpensDoors as its own workspace — so an operator reading the
 * training sees exactly the business, contacts, mailboxes, suppression
 * sheets and template they will actually be working with in production.
 */

export type TrainingScreenshot = {
  src: string;
  alt: string;
  caption?: string;
  width: number;
  height: number;
};

export type TrainingStep = {
  title: string;
  detail: string;
};

export type TrainingNextStep = {
  label: string;
  /** Deep-link to another training module by id. */
  moduleId?: string;
  /** Direct portal href for "Open this page in the portal" style CTAs. */
  href?: string;
  description?: string;
};

export type TrainingPortalLink = {
  label: string;
  href: string;
  description?: string;
};

export type TrainingExample = {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
};

export type TrainingCallout = {
  tone: "info" | "warn" | "success";
  heading?: string;
  body: string;
};

export type TrainingCodeBlock = {
  caption?: string;
  language?: "text" | "email";
  content: string;
};

export type TrainingModule = {
  id: string;
  order: number;
  title: string;
  tagline: string;
  /** 1. What this page is for (short paragraph). */
  purpose: string;
  /** Optional extra context rendered under the purpose. */
  details?: string[];
  /** 2. Screenshot(s) from the production portal. */
  screenshots: TrainingScreenshot[];
  /** 3. Step-by-step instructions — what the operator does. */
  steps: TrainingStep[];
  /** 4. What good looks like — bullets the operator can verify. */
  whatGoodLooksLike: string[];
  /** 5. Common mistakes to avoid. */
  commonMistakes: string[];
  /** 6. What to do next — mix of module deep-links and portal links. */
  nextSteps: TrainingNextStep[];
  /** 7. Primary portal link — "Open this page in the portal". */
  portalLink: TrainingPortalLink;
  /** Optional secondary portal deep-links. */
  relatedPortalLinks?: TrainingPortalLink[];
  /** OpensDoors-specific example data for this module. */
  exampleData?: TrainingExample[];
  /** Optional highlighted email body or code sample. */
  code?: TrainingCodeBlock;
  /** Optional highlighted callout rendered near the top of the module. */
  callout?: TrainingCallout;
  /** Bottom-of-module outcomes — what you should now be able to do. */
  outcomes: string[];
};

/** Canonical OpensDoors example data used consistently across every module. */
export const OPENSDOORS_TRAINING_EXAMPLE = {
  client: {
    name: "OpensDoors",
    website: "https://www.opensdoors.co.uk",
    sector: "Business Development",
    linkedin: "https://www.linkedin.com/company/blisscipline-uk/",
    accountManagerEmail: "samantha@opensdoors.co.uk",
  },
  contact: {
    firstName: "James",
    lastName: "Munro",
    email: "james@opensdoors.co.uk",
    mobile: "+447545534802",
    role: "Chief Financial Officer",
    status: "Active",
  },
  suppression: {
    emailsSheetUrl:
      "https://docs.google.com/spreadsheets/d/156RhRnECKs5Qj05meNw0AEbPXsMrZnadJunZNi0LbbA/edit?pli=1&gid=0#gid=0",
    domainsSheetUrl:
      "https://docs.google.com/spreadsheets/d/1dfxwimtdd_W6YaQb6iJSu8Ty9qoFGJ0biThmHUjpvz0/edit?gid=0#gid=0",
  },
  mailboxes: [
    "adam@opensdoors.co.uk",
    "elys@opensdoors.co.uk",
    "danielle@opensdoors.co.uk",
    "joe@opensdoors.co.uk",
    "greg@opensdoors.co.uk",
  ] as const,
  template: {
    category: "Introduction" as const,
    name: "OpensDoors Friendly Introduction 1",
    subject: "Growing {{company_name}}'s customer base?",
    body: [
      "Hi {{first_name}},",
      "",
      "Hope you're doing well today.",
      "",
      "I'm reaching out from Opensdoors because we specialize in helping businesses like yours secure new, valuable customer relationships and drive significant growth.",
      "",
      "Many companies struggle with consistent, high-quality outreach to decision-makers, especially when targeting larger opportunities. That's where we come in. We act as a seamless extension of your team, running targeted campaigns and building genuine relationships on your behalf. This approach typically leads to a shorter sales cycle and a quicker return on investment.",
      "",
      "With 16 years of experience, we've helped numerous companies expand their reach and secure new business across various sectors. Our clients often tell us how quickly they see tangible results.",
      "",
      "Would you be open to a brief 15-minute chat next week to explore how Opensdoors could help {{company_name}} achieve its growth goals?",
      "",
      "Best,",
      "{{email_signature}}",
    ].join("\n"),
  },
  capacity: {
    perMailboxDailyCap: 30,
    maxMailboxes: 5,
    dailyTheoreticalMax: 150,
  },
} as const;

const ex = OPENSDOORS_TRAINING_EXAMPLE;

// Standardised portal screenshot dimensions from the production portal at
// 1440×900 viewport. All main-content shots land at 1470×939; sidebar is
// narrower. We keep these explicit so Next.js can lay out the images
// without layout shift.
const FULL_W = 1470;
const FULL_H = 939;
const SIDE_W = 384;
const SIDE_H = 939;

const onboardingModule: TrainingModule = {
  id: "onboarding",
  order: 1,
  title: "Onboarding a client workspace",
  tagline: "Create the OpensDoors workspace and land on the overview.",
  purpose:
    "The Clients and New client pages are where a programme begins. Create the workspace shell, give it a canonical name and slug, then land on the Overview — the control centre for everything that follows (Brief, Mailboxes, Sources, Contacts, Suppression, Outreach, Activity).",
  details: [
    'For this training the worked example is OpensDoors itself. You create a workspace called "OpensDoors" and use the real OpensDoors business details, so the copy, signatures, mailboxes and suppression you see in training are the exact values you will see in production.',
    "Creating the shell is a pure data action. No emails are sent, no mailboxes are contacted, no sheets are pulled, no OAuth is touched.",
  ],
  screenshots: [
    {
      src: "/training/training-clients.png",
      alt: "Clients page listing every client workspace the operator can access",
      caption:
        "Clients page — every workspace you can access. Click Add client, or Open to enter an existing workspace.",
      width: FULL_W,
      height: FULL_H,
    },
    {
      src: "/training/training-new-client.png",
      alt: "Add a client form with Client name, Workspace slug, Industry, Website and Internal notes fields",
      caption:
        "Add a client — name, slug (auto-derived), industry, website, internal notes. The new client starts in Onboarding.",
      width: FULL_W,
      height: FULL_H,
    },
    {
      src: "/training/training-overview.png",
      alt: "Client workspace overview with the 7-step workflow strip and Getting started checklist",
      caption:
        "Overview — the 7-step workflow strip and Getting started checklist. Every other module is one click from here.",
      width: FULL_W,
      height: FULL_H,
    },
  ],
  steps: [
    {
      title: "Open Clients → New client",
      detail:
        "From the sidebar, click Clients, then the Add client button (or the New client sidebar entry). You'll land on the Add a client form.",
    },
    {
      title: "Enter the business identity",
      detail:
        'For the OpensDoors example: Client name "OpensDoors", website https://www.opensdoors.co.uk, industry "Business Development". Leave the slug auto-derived (opensdoors) unless it clashes — the slug is used in URLs and must be unique.',
    },
    {
      title: "Add internal notes if useful",
      detail:
        "Record billing contact, tone preferences, handoff owner. For OpensDoors note Samantha as the assigned account manager and James Munro (CFO) as the main client contact.",
    },
    {
      title: "Click Create workspace",
      detail:
        "You land on the Overview. The workflow strip shows Brief → Mailboxes → Sources → Suppression → Contacts → Outreach → Activity. The client stays in ONBOARDING until every required step is complete.",
    },
    {
      title: "Bookmark the Overview",
      detail:
        "The Overview is the control centre for this client. Every other module links back here via the breadcrumb and the workflow strip.",
    },
  ],
  whatGoodLooksLike: [
    "The workspace appears in the Clients list with the correct name and slug.",
    "Overview loads with the 7-step workflow strip visible and the Getting started checklist filled with pending items.",
    "Internal notes name the account manager (Samantha) and the main client contact (James Munro).",
    "The status pill on Overview reads ONBOARDING (or ACTIVE only after launch approval).",
  ],
  commonMistakes: [
    'Typing a marketing name instead of the canonical legal name — use "OpensDoors", not "OpensDoors Ltd – Growth Team".',
    "Editing the slug after creation — slugs are baked into URLs; leave the auto-derived value alone.",
    "Creating a second workspace for the same client because you couldn't find the first — always search Clients first.",
    "Skipping internal notes — Samantha, James Munro and the campaign objective belong on this card so the next operator isn't guessing.",
  ],
  nextSteps: [
    {
      label: "Fill in the business brief",
      moduleId: "brief",
      description:
        "The brief holds business identity, ICP, and positioning. Signatures and mailbox setup are on the Mailboxes page.",
    },
    {
      label: "Connect outreach mailboxes",
      moduleId: "mailboxes",
      description:
        "Up to five sending mailboxes; OpensDoors uses all five (30/day each = 150/day pool).",
    },
  ],
  portalLink: {
    label: "Open Clients in the portal",
    href: "/clients",
    description: "The live Clients list — staff access required.",
  },
  relatedPortalLinks: [
    {
      label: "New client form",
      href: "/clients/new",
      description: "Scaffold a brand new workspace.",
    },
  ],
  exampleData: [
    { label: "Client name", value: ex.client.name },
    { label: "Website", value: ex.client.website, mono: true, href: ex.client.website },
    { label: "Sector", value: ex.client.sector },
    { label: "LinkedIn", value: ex.client.linkedin, mono: true, href: ex.client.linkedin },
    { label: "Account manager", value: ex.client.accountManagerEmail, mono: true },
    {
      label: "Main contact",
      value: `${ex.contact.firstName} ${ex.contact.lastName} — ${ex.contact.role}`,
    },
  ],
  callout: {
    tone: "info",
    heading: "No outbound actions on this page",
    body: "Creating the shell writes one database row. Nothing is sent, no sheets are pulled, no OAuth is touched. Launch gates live further down the checklist.",
  },
  outcomes: [
    "You can create a client workspace end-to-end without guessing.",
    "You know the workspace stays in Onboarding until the full setup workflow is done.",
    "You can identify the main client contact (James Munro) and the account manager (Samantha) from internal notes.",
  ],
};

const briefModule: TrainingModule = {
  id: "brief",
  order: 2,
  title: "The business brief",
  tagline: "Source of truth for who the client is and who they want to reach.",
  purpose:
    "The Brief captures company identity, main contact, ICP (service areas, industries, company sizes, job titles), positioning, compliance, and internal ownership. Template placeholders like {{email_signature}} and per-mailbox sender names are configured on the Mailboxes page, not in the brief.",
  details: [
    "Sections group fields clearly: company identity, main contact, service and ICP (structured multi-selects that build a shared term list), positioning, compliance with optional PDFs, and internal notes.",
    "Empty required fields block launch. Operational setup (mailboxes, sequences, sourcing) has its own modules.",
  ],
  screenshots: [
    {
      src: "/training/training-brief.png",
      alt: "Client brief page with company identity, ICP, and positioning sections",
      caption:
        "Client brief — business and targeting. Use the Mailboxes page for sender signatures.",
      width: FULL_W,
      height: FULL_H,
    },
  ],
  steps: [
    {
      title: "Fill in Company identity",
      detail:
        "Workspace name is fixed at creation. Add website, sector, LinkedIn, and a structured business address (or type it manually if address lookup is not connected).",
    },
    {
      title: "Capture the main client contact",
      detail:
        "Name, role, work email, and status — the person you brief internally, not the From: line on email (that is mailbox-level).",
    },
    {
      title: "Define service areas and ICP",
      detail:
        "Use the chip fields for service areas, industries, company sizes, and job titles. New values you add are saved for other clients. Legacy free-text fields still work for older briefs.",
    },
    {
      title: "Positioning and proof",
      detail:
        "Value proposition, core offer, differentiators, proof notes, and exclusions. This is what operators and copy should align to before templates and sequences.",
    },
    {
      title: "Compliance and PDFs",
      detail:
        "Compliance notes plus PDF uploads for accreditations or supporting documents when needed.",
    },
    {
      title: "Internal ownership",
      detail:
        "Assign an account manager and add internal notes that should not appear in customer-facing copy.",
    },
    {
      title: "Click Save brief",
      detail:
        "Saving does not send email. Mailboxes, signatures, and sequences are configured in their own pages.",
    },
  ],
  whatGoodLooksLike: [
    "ICP chips are filled (or legacy profile text) so sourcing and sequences have a clear audience.",
    "Positioning fields read like a tight sales narrative, not marketing fluff.",
    "Account manager and main contact are named so the next operator knows who to call.",
    "Compliance PDFs are attached when the sector needs evidence on file.",
  ],
  commonMistakes: [
    "Treating the brief as the place to configure mailboxes or sequences — those live under Mailboxes, Sequences, and Sources.",
    "Expecting the brief to set {{email_signature}} — configure signatures per mailbox in Mailboxes (brief may still hold legacy text for old data).",
    "Skipping exclusions — keep partners and competitors out of the ICP and suppression lists before sends.",
  ],
  nextSteps: [
    {
      label: "Connect outreach mailboxes",
      moduleId: "mailboxes",
      description: "Five mailboxes × 30/day = 150 governed sends per UTC day.",
    },
    {
      label: "Configure suppression",
      moduleId: "suppression",
      description: "Attach the two OpensDoors Google Sheets before any contacts are imported.",
    },
  ],
  portalLink: {
    label: "Open the Brief in the portal",
    href: "/clients",
    description: "Pick the OpensDoors client from Clients, then the Brief tab.",
  },
  exampleData: [
    { label: "Client", value: ex.client.name },
    { label: "Website", value: ex.client.website, mono: true, href: ex.client.website },
    { label: "Signs outreach", value: "Samantha (account manager)" },
    {
      label: "Main client contact",
      value: `${ex.contact.firstName} ${ex.contact.lastName} — ${ex.contact.role}`,
    },
  ],
  callout: {
    tone: "warn",
    heading: "The brief gates launch",
    body: "A thin brief means thin messaging and blocks readiness. Signatures and mailbox capacity are still configured on the Mailboxes page.",
  },
  outcomes: [
    "You can separate business brief content from operational setup.",
    "You can spot a brief that is too thin to launch from.",
    "You know where to go for signatures and sending identity (Mailboxes).",
  ],
};

const mailboxesModule: TrainingModule = {
  id: "mailboxes",
  order: 3,
  title: "Mailboxes and sender identities",
  tagline: "Shared workspace pool — up to five addresses, 30 sends/day each.",
  purpose:
    "The Mailboxes page lists every connected sending address for a client, its provider (Microsoft 365 or Google Workspace), connection state, daily capacity, and per-mailbox sender identity. Mailboxes belong to the client workspace; any authorised operator on that client may send from an eligible address in the pool. Read this page before every launch to avoid the wrong From address or a silent zero-capacity state.",
  details: [
    `OpensDoors runs outreach from up to ${String(ex.capacity.maxMailboxes)} connected mailboxes per workspace. Each mailbox sends up to ${String(ex.capacity.perMailboxDailyCap)} messages per UTC day, for a pooled ceiling of ${String(ex.capacity.dailyTheoreticalMax)} sends per day.`,
    "Each mailbox has its own sender name, signature, and daily counter. The workspace pools capacity: the planner prefers the mailbox with the most remaining slots, breaking ties with the primary address — it is not a personal lock on a mailbox for one operator.",
  ],
  screenshots: [
    {
      src: "/training/training-mailboxes.png",
      alt: "Mailboxes sender identity panel: default From address and sender readiness checklist",
      caption:
        "Mailboxes — top of page. Sender identity readiness is the gate for live delivery.",
      width: FULL_W,
      height: FULL_H,
    },
    {
      src: "/training/training-mailboxes-list.png",
      alt: "Connected mailboxes table with provider, connection status and daily capacity",
      caption:
        'Connected mailboxes — up to 5 × 30/day. Status pills: Connected / Connection error. Provider id is safe to show.',
      width: FULL_W,
      height: FULL_H,
    },
  ],
  steps: [
    {
      title: "Open the client's Mailboxes tab",
      detail:
        "From Overview, click the Mailboxes sub-nav entry. The top card shows sender identity readiness; the lower card lists each connected mailbox with its provider, status, remaining capacity and signature.",
    },
    {
      title: "Read the status pill for every mailbox",
      detail:
        "Connected is the only state that contributes to capacity. Anything else (expired OAuth, connection error, sending disabled, ledger at cap) is excluded from planning and sending.",
    },
    {
      title: "Confirm the per-mailbox signature",
      detail:
        "Google Workspace mailboxes can pull the signature directly from Gmail with Sync from Gmail. Microsoft 365 mailboxes don't expose the signature over API — an admin pastes the approved signature via Edit manual signature.",
    },
    {
      title: "Check the daily capacity line",
      detail:
        "The table header summarises the workspace pool: active count, per-mailbox day cap, and sent today. With five connected mailboxes the theoretical ceiling is 150/day; with three it is 90.",
    },
    {
      title: "Do not reconnect or disconnect during training",
      detail:
        "Reconnect/Disconnect buttons trigger OAuth flows and remove mailboxes from sending. Training is read-only — you observe the state, you don't change it.",
    },
  ],
  whatGoodLooksLike: [
    "All five OpensDoors mailboxes (adam@, elys@, danielle@, joe@, greg@) show Connected with a green pill.",
    "One mailbox is marked Primary — used as a tie-break for the planner, not an exclusive lock.",
    "Every mailbox has a non-empty signature, either synced from Gmail or pasted manually.",
    'Header reads "Active mailboxes: 5/5" and capacity is "150/day" for a fully staffed OpensDoors workspace.',
    "Sender readiness shows a live email provider (not a non-delivery transport) when the client is approved for real outreach delivery.",
  ],
  commonMistakes: [
    "Launching with three connected mailboxes and assuming 150/day — check the header; the capacity is 3 × 30 = 90.",
    "Forgetting that Microsoft 365 signatures don't sync — every Microsoft mailbox needs a pasted signature, or {{email_signature}} falls back to the brief.",
    "Reconnecting a mailbox mid-campaign to 'fix' a non-issue — this interrupts sending and invalidates cached tokens.",
    "Treating connection error as cosmetic — a stale mailbox silently consumes zero capacity until it reconnects.",
  ],
  nextSteps: [
    {
      label: "Source contacts from RocketReach or CSV",
      moduleId: "sources",
      description: "Sources is where contacts enter the workspace.",
    },
    {
      label: "Configure suppression before any send",
      moduleId: "suppression",
      description: "Two Google Sheets per client — emails and domains.",
    },
  ],
  portalLink: {
    label: "Open the Mailboxes tab in the portal",
    href: "/clients",
    description: "Open the client workspace, then click Mailboxes.",
  },
  exampleData: ex.mailboxes.map<TrainingExample>((m, i) => ({
    label: i === 0 ? "Primary outreach mailbox" : "Outreach mailbox",
    value: m,
    mono: true,
  })),
  callout: {
    tone: "info",
    heading: "Test mode vs. live",
    body: "A workspace in test mode sends as noreply@opensdoors.local and never reaches prospects. Live delivery is enabled by an admin once the brief, mailboxes, suppression and pilot are all green.",
  },
  outcomes: [
    "You know which five mailboxes OpensDoors sends from and their per-mailbox daily caps.",
    "You can read the Mailboxes tab and spot reduced capacity, expired OAuth or missing signatures at a glance.",
    "You understand signature resolution is mailbox-first, brief-second.",
  ],
};

const sourcesModule: TrainingModule = {
  id: "sources",
  order: 4,
  title: "Sources — importing contacts",
  tagline: "Bring contacts into the OpensDoors workspace via RocketReach or CSV.",
  purpose:
    "Sources is the only supported way to bring contacts into a client workspace. Every import is saved to a named email list (for example \"Manchester FDs — April 2026\"), and sequences later send to exactly one list you choose. You either run a RocketReach search or upload a CSV of contacts — nothing else touches the contact store.",
  details: [
    "Imports don't bypass suppression. Suppression is applied at enrollment time, so safe-to-import and safe-to-email are two different things.",
    "Contact rows are valid if they have at least one of: email, LinkedIn, mobile phone, or office phone. They are ready-to-email only if they also have an email address — only ready-to-email contacts are included in sends.",
  ],
  screenshots: [
    {
      src: "/training/training-sources.png",
      alt: "Sources page with accepted CSV headings, Valid contact / Ready to email definitions, and RocketReach search form",
      caption:
        "Sources — accepted CSV headings, Valid vs. Ready-to-email definitions, and the RocketReach Simple search form.",
      width: FULL_W,
      height: FULL_H,
    },
  ],
  steps: [
    {
      title: "Pick or create the target email list",
      detail:
        'Either select an existing list or type a new list name in "Or create a new list" (for example "OpensDoors — UK CFOs April 2026"). The import is saved against that list.',
    },
    {
      title: "Choose your import source",
      detail:
        "Simple search (RocketReach) for prospecting or Raw JSON for already-shaped payloads. For CSV imports click Open CSV import; the Contacts page filters automatically to this client.",
    },
    {
      title: "Run the import (max 10 per run)",
      detail:
        "Keep batches small — 10 at a time is the cap and the right size for review. Preview the result before committing.",
    },
    {
      title: "Confirm every row is valid",
      detail:
        "A valid row needs at least one contactable channel (email, LinkedIn, mobile, office). Rows without any channel are surfaced as invalid and excluded.",
    },
    {
      title: "Send the list to Contacts",
      detail:
        "Once the import completes, open the Contacts tab to see the list, its unique contacts, and how many are ready-to-email after suppression is applied.",
    },
  ],
  whatGoodLooksLike: [
    "Every import belongs to a named list — never a dumping ground list called \"Imports\" or \"All\".",
    "List name includes the client, segment and month so the next operator knows what it is.",
    "Preview shows a clean split between Valid contacts and Ready-to-email.",
    "Suppression is already configured before you import — so the Contacts KPIs reflect real eligibility.",
    "No PII leaks into internal notes or sheet URLs; the data stays in the workspace store.",
  ],
  commonMistakes: [
    "Importing into a list you'll never name again — future sequences won't know which list to target.",
    "Running imports before suppression is attached — suppression blocks at enrollment, so you get false positives on 'eligible'.",
    "Uploading CSVs with custom headings — stick to the accepted headings (Name, Employer, Title, First/Last Name, Emails, Phone, etc).",
    "Running giant imports to save time — max 10 per run exists to keep data quality honest.",
  ],
  nextSteps: [
    {
      label: "Review contacts and list KPIs",
      moduleId: "contacts",
      description: "See what's ready-to-email after suppression.",
    },
    {
      label: "Build the outreach sequence",
      moduleId: "outreach",
      description: "Target exactly one email list per sequence.",
    },
  ],
  portalLink: {
    label: "Open Sources in the portal",
    href: "/clients",
    description: "Inside the OpensDoors workspace, click Sources.",
  },
  callout: {
    tone: "info",
    heading: "Training does not run imports",
    body: "Explanations on this page are read-only. Do not click Run import against production data while walking through training.",
  },
  outcomes: [
    "You can run a small RocketReach or CSV import into a named list.",
    "You know the difference between Valid and Ready-to-email.",
    "You always run Sources after Suppression is configured, not before.",
  ],
};

const contactsModule: TrainingModule = {
  id: "contacts",
  order: 5,
  title: "Contacts and email lists",
  tagline: "Read-only view of who's in the workspace and who can be emailed.",
  purpose:
    "The Contacts tab is the operator's read-only dashboard for this client's contact store. It shows every list attached to the client, the total unique contacts across all lists, and the KPI splits — Ready to email, Suppressed, Missing email, Missing identifier. Sequences later send to exactly one list you choose here.",
  details: [
    "Contacts are never edited in-place. If you need to add or change contacts, do it from Sources (import) or via the Suppression sheets — this page is a window, not a workbench.",
    "Unique counts dedupe across lists. A contact on three lists still counts as one unique contact.",
  ],
  screenshots: [
    {
      src: "/training/training-contacts.png",
      alt: "Contact lists page with Total lists, Unique contacts, Ready to email, Suppressed, Missing email and Missing identifier KPI cards",
      caption:
        "Contact lists — KPI cards at a glance: Total lists, Unique contacts, Ready to email, Suppressed, Missing email, Missing identifier.",
      width: FULL_W,
      height: FULL_H,
    },
  ],
  steps: [
    {
      title: "Open Contacts from the client sub-nav",
      detail:
        "Inside the OpensDoors workspace, click Contacts. The KPI strip renders first — read these numbers before any further decision.",
    },
    {
      title: "Interpret the KPI cards",
      detail:
        "Total lists = how many imports you have; Unique contacts = people in the workspace (deduped); Ready to email = valid + not suppressed + has email; Suppressed = blocked by this client's rules; Missing email / Missing identifier = reachable another way but no email.",
    },
    {
      title: "Scan the per-list panels",
      detail:
        "Each list shows its name, how many of its contacts are ready-to-email, and the last import date. If a list has zero ready-to-email, you know it's either entirely suppressed or entirely missing emails.",
    },
    {
      title: "Jump back to Sources or Suppression from the quick links",
      detail:
        "Open sources (to import more), Open outreach (to build a sequence against a list), and Open suppression (to review why contacts are blocked) are at the top of the page.",
    },
  ],
  whatGoodLooksLike: [
    "Every list is named clearly and has a non-zero Ready to email count.",
    "Suppressed count is small but non-zero — zero suppressed means you probably haven't run suppression sync.",
    "Missing identifier count is zero or near-zero — rows without any channel shouldn't be imported in the first place.",
    "You can pick exactly one list per sequence without hesitation.",
  ],
  commonMistakes: [
    "Treating Total lists as important — one carefully named list beats five anonymous ones.",
    "Ignoring Missing email and assuming those contacts can be emailed anyway — they cannot.",
    "Editing contacts in the database to 'fix' suppression — update the OpensDoors suppression sheet instead.",
    "Building a sequence before the KPIs look clean — the sequence inherits every flaw in the list.",
  ],
  nextSteps: [
    {
      label: "Configure suppression",
      moduleId: "suppression",
      description: "Shrink Suppressed and Missing identifier before enrolling.",
    },
    {
      label: "Build the outreach sequence",
      moduleId: "outreach",
      description: "Pick a clean list and wire it to the approved intro template.",
    },
  ],
  portalLink: {
    label: "Open Contacts in the portal",
    href: "/clients",
    description: "Inside the OpensDoors workspace, click Contacts.",
  },
  callout: {
    tone: "info",
    heading: "This page is read-only by design",
    body: "Adds and edits happen in Sources and Suppression. The Contacts tab only reads — so the numbers you see are the numbers the sequence planner sees.",
  },
  outcomes: [
    "You can read the Contacts tab and explain every KPI without a reference.",
    "You know Contacts is a read-only window, not the place to edit data.",
    "You always pair this page with Sources and Suppression before launching a sequence.",
  ],
};

const suppressionModule: TrainingModule = {
  id: "suppression",
  order: 6,
  title: "Suppression — email and domain sheets",
  tagline: "Two OpensDoors Google Sheets stand between outreach and the wrong inbox.",
  purpose:
    "Suppression is how we keep outreach safe. OpensDoors maintains one Google Sheet of suppressed emails and one of suppressed domains. The Suppression tab on each client workspace stores those sheet URLs, triggers sync, and renders the last-sync status. Nothing ships without suppression being present and healthy.",
  details: [
    "Each client has its own suppression sheets — we never share a suppression list across tenants. Admin-level Google service account credentials are already configured; operators only paste sheet URLs and click Sync.",
    "The service account email shown on the page (the `...gserviceaccount.com` address) is the identity operators share each sheet with as Viewer. It is not a secret.",
  ],
  screenshots: [
    {
      src: "/training/training-suppression.png",
      alt: "Client suppression page with service account email, email suppression sheet id and domain suppression field",
      caption:
        "Suppression tab — paste the email sheet URL, paste the domain sheet URL, share both with the service account as Viewer.",
      width: FULL_W,
      height: FULL_H,
    },
    {
      src: "/training/training-suppression-monitor.png",
      alt: "Global suppression monitor with integration status and per-client sources",
      caption:
        "Suppression monitor — the cross-client health view. Integration status, service account email, and each client's sync state.",
      width: FULL_W,
      height: FULL_H,
    },
  ],
  steps: [
    {
      title: "Open the OpensDoors Emails sheet URL",
      detail:
        "Copy the OpensDoors suppression-emails Google Sheet URL, paste it into the Email suppression field, and click Save email sheet.",
    },
    {
      title: "Share the sheet with the service account as Viewer",
      detail:
        "In Google Sheets, Share → paste the service account email shown on the Suppression page → role Viewer → Send. The portal cannot read the sheet until this step is done.",
    },
    {
      title: "Repeat for the domains sheet",
      detail:
        "Same flow for the domain suppression sheet. Domains block whole companies (competitors, partners, do-not-contact).",
    },
    {
      title: "Click Sync once each",
      detail:
        'First sync pulls every row into the client\'s suppression store. The connection status at the bottom shows "EMAIL · SUCCESS · last sync <timestamp>" when healthy.',
    },
    {
      title: "Re-read the status before every launch",
      detail:
        "Open the Suppression monitor (sidebar → Suppression) any time you want a cross-client view. Last-sync timestamps older than a few days are a flag.",
    },
  ],
  whatGoodLooksLike: [
    "Both suppression sheets are attached and show a recent SUCCESS timestamp.",
    "Sharing the sheet with the service account shows it as a Viewer in Google Sheets.",
    "The Contacts tab reflects the suppression sync in its Suppressed KPI (non-zero).",
    "The cross-client monitor shows Integration status = Credentials detected and no amber/red badges.",
  ],
  commonMistakes: [
    "Forgetting to share the sheet with the service account — the sync silently fails with a permission error.",
    "Using a draft sheet that hasn't been populated — the sync succeeds but blocks nothing.",
    "Treating suppression as 'nice to have' — empty suppression is the fastest way to send to the wrong person and burn the relationship.",
    "Running sync during training — observe the status, don't click Sync against live data.",
  ],
  nextSteps: [
    {
      label: "Build the outreach sequence",
      moduleId: "outreach",
      description: "Now that suppression is healthy, templates and sequences are safe to wire up.",
    },
    {
      label: "Monitor activity for unsubscribes",
      moduleId: "activity",
      description: "Unsubscribes flow into suppression automatically.",
    },
  ],
  portalLink: {
    label: "Open Suppression in the portal",
    href: "/clients",
    description: "Inside the OpensDoors workspace, click Suppression.",
  },
  relatedPortalLinks: [
    {
      label: "Cross-client Suppression monitor",
      href: "/suppression",
      description: "Top-level view of every client's sync health.",
    },
  ],
  exampleData: [
    {
      label: "OpensDoors — Emails sheet",
      value: ex.suppression.emailsSheetUrl,
      mono: true,
      href: ex.suppression.emailsSheetUrl,
    },
    {
      label: "OpensDoors — Domains sheet",
      value: ex.suppression.domainsSheetUrl,
      mono: true,
      href: ex.suppression.domainsSheetUrl,
    },
  ],
  callout: {
    tone: "warn",
    heading: "Missing suppression is a launch blocker",
    body: "If suppression is missing or stale, the launch checklist will not clear. Treat it as a hard gate — wrong-person sends carry regulatory, reputation and mailbox-deliverability cost.",
  },
  outcomes: [
    "You know where the OpensDoors Emails and Domains suppression sheets live.",
    "You can share a new sheet with the service account and run a first sync.",
    "You never launch a client that has missing or stale suppression.",
  ],
};

const outreachModule: TrainingModule = {
  id: "outreach",
  order: 7,
  title: "Outreach — templates and sequences",
  tagline: "Build OpensDoors Friendly Introduction 1 into a launch-ready sequence.",
  purpose:
    "The Outreach tab is where templates are written, reviewed, approved, and assembled into sequences. It also owns the controlled pilot sender (governed test domains only) and the launch-readiness checklist for this client. Approving a template or sequence does not send email — sending is always a separate action.",
  details: [
    "Templates are scoped to a client and a category (Introduction, Follow-up 1–5). Sequences reference approved templates by id and attach exactly one email list as the audience.",
    'The worked example template for OpensDoors is "OpensDoors Friendly Introduction 1". Study its placeholders — it uses {{first_name}}, {{company_name}} and {{email_signature}} and that is exactly what every downstream send depends on.',
  ],
  screenshots: [
    {
      src: "/training/training-outreach.png",
      alt: "Outreach page showing templates KPI cards (Total, Approved, Ready for review, Draft, Archived) and the New template form",
      caption:
        "Outreach — templates overview, status KPI cards, and the New template form. Saving or approving a template does not send email.",
      width: FULL_W,
      height: FULL_H,
    },
    {
      src: "/training/training-outreach-placeholders.png",
      alt: "Supported placeholders reference — first_name, last_name, company_name, sender_name, sender_company_name, email_signature, unsubscribe_link",
      caption:
        'Supported placeholders. Use {{ key }} in subject or content. Unknown placeholders block approval. {{sender_company_name}} is the sending client; {{company_name}} is the target.',
      width: FULL_W,
      height: FULL_H,
    },
  ],
  steps: [
    {
      title: "Draft a template against a category",
      detail:
        'Click New template, pick a category (Introduction for the first send), give it a name like "OpensDoors Friendly Introduction 1", write the subject and body.',
    },
    {
      title: "Use supported placeholders only",
      detail:
        "The Supported placeholders panel lists every token the renderer understands. Unknown placeholders block approval. For the first touch: {{first_name}}, {{company_name}}, {{email_signature}}.",
    },
    {
      title: "Save the draft, then approve it",
      detail:
        'Draft templates are invisible to the sequence builder. Only approved templates appear in the step picker — this is how we keep half-written copy off the wire.',
    },
    {
      title: "Create the sequence",
      detail:
        'New sequence → pick the target email list, attach OpensDoors Friendly Introduction 1 as step 1 (Introduction), add Follow-up 1–5 templates as later steps, set delays in days.',
    },
    {
      title: "Mark the sequence Ready for review, then Approved",
      detail:
        'Readiness shows blockers (no approved Introduction template, no list, etc.). Approving the sequence arms it for enrollment — but does not send.',
    },
    {
      title: "Run a controlled pilot before going live",
      detail:
        "Controlled pilot sends go to governed test domains (internal) only — external recipients are rejected server-side. Use it to verify signature rendering, subject personalisation, and threading. Typing 'SEND PILOT' into the confirmation field gates the run.",
    },
  ],
  whatGoodLooksLike: [
    "Every template used in a sequence is Approved (not Ready for review, not Draft).",
    "Subject and body preview cleanly for a typical OpensDoors prospect — no stray brace, no unresolved placeholder.",
    "Signature renders as expected when piloted: the sending mailbox's signature wins; the brief's signature is the fallback.",
    "Launch readiness panel is entirely green before any real-prospect send.",
    "Pilot run completes and the recipients see the message in their allowlisted inbox within a few minutes.",
  ],
  commonMistakes: [
    'Using {{company_name}} and {{sender_company_name}} interchangeably — {{company_name}} is the target company; {{sender_company_name}} is OpensDoors (the sender).',
    'Leaving {{email_signature}} off the body — every real sequence should sign off properly.',
    "Approving a template without reading it out loud — awkward sentences always make it out in volume.",
    "Launching a pilot with external recipients — the server rejects them, but operators waste time constructing the list.",
    "Clicking Queue pilot batch during training — don't. Training walks through the flow; it doesn't run pilots.",
  ],
  nextSteps: [
    {
      label: "Monitor activity and replies",
      moduleId: "activity",
      description: "Every send, reply and unsubscribe lands in Activity.",
    },
    {
      label: "Review settings and access",
      moduleId: "settings",
      description: "Close the loop on who can touch this workspace.",
    },
  ],
  portalLink: {
    label: "Open Outreach in the portal",
    href: "/clients",
    description: "Inside the OpensDoors workspace, click Outreach.",
  },
  exampleData: [
    { label: "Template category", value: ex.template.category },
    { label: "Template name", value: ex.template.name },
    { label: "Subject", value: ex.template.subject, mono: true },
    { label: "Placeholders", value: "{{first_name}}, {{company_name}}, {{email_signature}}", mono: true },
  ],
  code: {
    caption: "OpensDoors Friendly Introduction 1 — email body",
    language: "email",
    content: `Subject: ${ex.template.subject}\n\n${ex.template.body}`,
  },
  callout: {
    tone: "info",
    heading: "Signature resolution is mailbox-first",
    body: "When a send goes out from elys@opensdoors.co.uk, the signature Elys carries on her mailbox wins. The brief-level signature only renders if the specific mailbox does not have one.",
  },
  outcomes: [
    "You can open OpensDoors Friendly Introduction 1 and recognise every placeholder.",
    "You can draft, approve, and wire a template into a sequence without asking.",
    "You know Queue pilot batch is the one button that reaches real inboxes — and you never press it during training.",
  ],
};

const activityModule: TrainingModule = {
  id: "activity",
  order: 8,
  title: "Activity, replies and inbound messages",
  tagline: "Monitor every send, reply and unsubscribe from inside ODoutreach.",
  purpose:
    "Once a sequence is live the work shifts from setup to monitoring. The Activity tab shows sends, replies, imports, mailbox events, unsubscribes and warnings — newest first, per client and cross-client. You never have to open Outlook to triage replies; ODoutreach renders the full inbound body and linked contact inline.",
  details: [
    "Activity is append-only. Every send, reply and unsubscribe becomes an event with a timestamp, a mailbox, and (for sends and replies) a contact and sequence step reference. That history is how you audit what went out and what came back.",
  ],
  screenshots: [
    {
      src: "/training/training-activity.png",
      alt: "Per-client activity timeline with Total events, Sends, Replies, Imports, Templates/Sequences and Warnings/Errors KPI cards",
      caption:
        "Per-client Activity — counts at the top, newest event first. Mailbox events include connection changes, signature edits, OAuth refreshes.",
      width: FULL_W,
      height: FULL_H,
    },
    {
      src: "/training/training-activity-global.png",
      alt: "Global Activity page showing Sent emails table across clients and Replies panel",
      caption:
        "Global Activity — Sent emails and Replies across every client you can access. Filter by workspace with the pills at the top.",
      width: FULL_W,
      height: FULL_H,
    },
  ],
  steps: [
    {
      title: "Open Activity (per-client or global)",
      detail:
        "From a client's sub-nav, click Activity for just that workspace. From the sidebar, click Activity for a cross-client feed with workspace filter pills.",
    },
    {
      title: "Read the KPI strip",
      detail:
        "Total events, Sends, Replies, Imports, Templates/Sequences, Warnings/Errors. A sudden spike in Warnings or Bounces is your first signal that something is off.",
    },
    {
      title: "Investigate every non-sent status",
      detail:
        "Bounced, suppressed, failed and queued-too-long each have different causes. Suppressed = expected (the suppression guard did its job); Bounced = deliverability risk; Failed = infrastructure — escalate.",
    },
    {
      title: "Read and reply to inbound messages in the portal",
      detail:
        "Click a reply event to see the full inbound body, from-address and linked contact. Compose your reply inside ODoutreach — it goes out through the original sending mailbox and preserves the thread.",
    },
    {
      title: "Treat every opt-out as terminal",
      detail:
        "One-click unsubscribes auto-suppress the contact. Inbound replies that say 'please remove me' should also end in the suppression sheet — don't rely on courtesy alone.",
    },
  ],
  whatGoodLooksLike: [
    "Replies are read and actioned the same day — no one in the team owns a day-old thread.",
    "Warnings/Errors is zero or small and understood; every non-zero has an investigation note.",
    "Sent count matches what you expected from mailbox capacity; shortfalls trace to a specific stuck mailbox.",
    "Every reply to OpensDoors outreach is handled inside ODoutreach — no replies sent from Outlook directly.",
    "The global Activity view shows balanced sending across the five OpensDoors mailboxes, not one mailbox carrying the load.",
  ],
  commonMistakes: [
    'Replying from Outlook — the portal loses the thread linkage back to the sequence.',
    "Ignoring the Warnings/Errors KPI — small numbers hide real issues.",
    "Treating bounces as noise — every bounce reduces a mailbox's daily capacity and signals a deliverability issue.",
    "Classifying a 'please remove me' reply as unsubscribe alone — also add the address to the OpensDoors suppression sheet.",
  ],
  nextSteps: [
    {
      label: "Review settings and admin responsibilities",
      moduleId: "settings",
      description: "Who can change what, and what should you never touch.",
    },
    {
      label: "Revisit suppression",
      moduleId: "suppression",
      description: "Unsubscribes and opt-outs must also make it into the sheet.",
    },
  ],
  portalLink: {
    label: "Open cross-client Activity",
    href: "/activity",
    description: "Sends and replies across every workspace you can access.",
  },
  relatedPortalLinks: [
    {
      label: "Dashboard",
      href: "/dashboard",
      description: "14-day volumes and recent activity at a glance.",
    },
  ],
  callout: {
    tone: "success",
    heading: "Reply hygiene is operator work",
    body: "The portal surfaces the signals. The human in the loop — the OpensDoors operator — classifies the reply and acts on it. Own your replies.",
  },
  outcomes: [
    "You can find, read and reply to an inbound message without leaving ODoutreach.",
    "You know the difference between bounced, suppressed and failed and what each demands.",
    "You never treat an unsubscribe or opt-out as a soft signal.",
  ],
};

const settingsModule: TrainingModule = {
  id: "settings",
  order: 9,
  title: "Settings and admin",
  tagline: "What admins configure — and what ordinary operators should not touch.",
  purpose:
    "Settings is for platform-level configuration, not per-client work. Team access, sign-in/security, sending defaults and integration credentials live here. Per-client configuration (brief, mailboxes, suppression, templates, sequences) always lives inside the client workspace.",
  details: [
    "Authentication is handled by Microsoft 365 — invitations and role changes flow through the OpensDoors tenant. Multi-factor auth, session length and conditional access are tenant-level policies, not portal switches.",
    'Blast radius matters: a wrong toggle in Settings affects every client at once. When in doubt, ask an admin — there is no fast-path fix.',
  ],
  screenshots: [
    {
      src: "/training/training-settings.png",
      alt: "Settings page with Team access, Sign-in and security, Sending and compliance, and Integrations sections",
      caption:
        "Settings — Team access, Sign-in and security, Sending and compliance, Integrations. Per-client config lives inside each client workspace.",
      width: FULL_W,
      height: FULL_H,
    },
    {
      src: "/training/training-sidebar.png",
      alt: "Main sidebar — Dashboard, Clients, New client, Operations, Contacts, Suppression, Activity, Reports, Settings",
      caption:
        "Main sidebar — Training lives here alongside Dashboard, Clients, Operations, Contacts, Suppression, Activity, Reports and Settings.",
      width: SIDE_W,
      height: SIDE_H,
    },
  ],
  steps: [
    {
      title: "Open Settings from the sidebar",
      detail:
        "Team access appears first (who can sign in, their role), followed by Sign-in and security, Sending and compliance, and Integrations.",
    },
    {
      title: "Read the Team access roster",
      detail:
        "Email + Role for each staff member. Only admins can change this — operators can review it.",
    },
    {
      title: "Understand what lives here vs. per-client",
      detail:
        "Per-client items — mailboxes, suppression, templates, sequences, contacts, brief — live inside the client workspace. Settings is strictly platform-level.",
    },
    {
      title: "Do not rotate credentials during an active campaign",
      detail:
        "Google service account JSON, email provider credentials, Microsoft tenant id, public base URL. These are rotated during planned windows by an admin, not ad-hoc.",
    },
    {
      title: "Know your escalation path",
      detail:
        'If you think Settings is wrong (missing colleague, wrong role, integration showing "Credentials missing"), open a ticket with an admin rather than trying to fix it yourself.',
    },
  ],
  whatGoodLooksLike: [
    "Team access shows every current OpensDoors operator with the correct role, and nobody who's moved on.",
    "Integrations panel shows Google service account as Credentials detected.",
    "Sign-in and security panel reflects the Microsoft 365 tenant policies — MFA, conditional access, session length — without per-user overrides.",
    "You can describe which knobs are admin-only from memory.",
  ],
  commonMistakes: [
    "Treating Settings as a shortcut to per-client work — it isn't.",
    "Changing team roles without an admin approving it.",
    "Rotating the Google service account JSON while a campaign is live.",
    "Assuming Settings is where you connect a mailbox — connect it from the client's Mailboxes tab.",
  ],
  nextSteps: [
    {
      label: "Refresh on monitoring",
      moduleId: "activity",
      description: "Settings changes often appear in Activity as warnings or events — cross-check there.",
    },
    {
      label: "Back to training overview",
      href: "/training",
      description: "Restart the course with a second client if you want to reinforce the flow.",
    },
  ],
  portalLink: {
    label: "Open Settings in the portal",
    href: "/settings",
    description: "Admin-only actions are gated server-side even if the UI shows the link.",
  },
  relatedPortalLinks: [
    {
      label: "Staff access",
      href: "/settings/staff-access",
      description: "Admin-only — manage operator roles.",
    },
  ],
  exampleData: [
    { label: "Example workspace", value: ex.client.name },
    { label: "Account manager", value: ex.client.accountManagerEmail, mono: true },
    {
      label: "Mailboxes connected",
      value: `${String(ex.mailboxes.length)} / ${String(ex.capacity.maxMailboxes)}`,
    },
  ],
  callout: {
    tone: "warn",
    heading: "Blast radius awareness",
    body: "Settings affect every client at once. A single wrong toggle here breaks multiple clients simultaneously. When in doubt, ask an admin.",
  },
  outcomes: [
    "You know the boundary between Settings (admin-only, platform-level) and per-client workspace configuration.",
    "You know which integrations and policies are handled outside the portal (Microsoft 365 tenant).",
    "You stop before touching a knob that could affect another client.",
  ],
};

export const TRAINING_MODULES: readonly TrainingModule[] = [
  onboardingModule,
  briefModule,
  mailboxesModule,
  sourcesModule,
  contactsModule,
  suppressionModule,
  outreachModule,
  activityModule,
  settingsModule,
];

export function getTrainingModule(id: string): TrainingModule | null {
  return TRAINING_MODULES.find((m) => m.id === id) ?? null;
}

/** Final outcomes the training as a whole is supposed to deliver. */
export const TRAINING_FINAL_OUTCOMES: readonly string[] = [
  "Understand the full OpensDoors outreach workflow end-to-end.",
  "Onboard a client workspace correctly, using OpensDoors' own onboarding as the worked example.",
  "Configure mailboxes and suppression the way OpensDoors actually uses them.",
  "Build, review and approve outreach — templates, sequences, enrollments — safely.",
  "Read and manage replies from inside ODoutreach without switching to Outlook.",
  "Know what to do next on each portal page without needing Greg to train you in person.",
];
