/**
 * PR I — Workspace "Getting started" view-model.
 *
 * Pure helper that derives the 8-item onboarding checklist shown on the
 * client overview when the client is still in ONBOARDING (or any
 * required module signal is missing). Kept free of Prisma / React so it
 * can be unit-tested and reused by any presenter.
 */

export type GettingStartedInput = {
  clientId: string;
  /** From `ClientLifecycleStatus`. */
  clientStatus: string;
  /** From `computeOnboardingBriefCompletion(...).status`. */
  briefStatus: "empty" | "partial" | "ready";
  /** Count of connected sending mailboxes. */
  connectedSendingCount: number;
  /** Count of configured suppression sheet sources. */
  suppressionSheetCount: number;
  /** Total contacts across any email list. */
  contactsTotal: number;
  /** Number of contacts enrolled in at least one sequence (0 if none). */
  enrolledContactsCount: number;
  /** APPROVED `ClientEmailTemplate` rows (any category). */
  approvedTemplatesCount: number;
  /** APPROVED `ClientEmailSequence` rows. */
  approvedSequencesCount: number;
  /** True when the pilot can actually run end-to-end. */
  outreachPilotRunnable: boolean;
};

export type GettingStartedItem = {
  id:
    | "brief"
    | "mailboxes"
    | "suppression"
    | "contacts"
    | "templates"
    | "sequences"
    | "enrollments"
    | "launch";
  label: string;
  description: string;
  href: string;
  done: boolean;
};

export type GettingStartedViewModel = {
  shouldRender: boolean;
  totalCount: number;
  completedCount: number;
  items: GettingStartedItem[];
};

/**
 * Build the Getting-started checklist for the client overview. The card
 * is only meaningful while the client is in ONBOARDING *or* any setup
 * module is still incomplete — once the client is ACTIVE and all items
 * are done we return `shouldRender: false` so the overview hides it.
 */
export function buildGettingStartedViewModel(
  input: GettingStartedInput,
): GettingStartedViewModel {
  const base = `/clients/${input.clientId}`;

  const items: GettingStartedItem[] = [
    {
      id: "brief",
      label: "Complete the business brief",
      description:
        "Identity, ICP, positioning, and compliance. Signatures and mailbox setup are on Mailboxes.",
      href: `${base}/brief`,
      done: input.briefStatus === "ready",
    },
    {
      id: "mailboxes",
      label: "Connect outreach mailboxes",
      description:
        "Connect at least one Microsoft 365 or Google Workspace mailbox. Up to five mailboxes @ 30/day each.",
      href: `${base}/mailboxes`,
      done: input.connectedSendingCount >= 1,
    },
    {
      id: "suppression",
      label: "Configure suppression",
      description:
        "Attach the client's email and domain suppression Google Sheet ids before importing contacts.",
      href: `${base}/suppression`,
      done: input.suppressionSheetCount > 0,
    },
    {
      id: "contacts",
      label: "Import contacts into an email list",
      description:
        "Create an email list and import contacts via CSV or RocketReach. Suppression is applied at enrollment.",
      href: `${base}/contacts`,
      done: input.contactsTotal > 0,
    },
    {
      id: "templates",
      label: "Approve message templates",
      description:
        "Draft and approve the introduction template and any follow-up templates for this client's voice.",
      href: `${base}/outreach`,
      done: input.approvedTemplatesCount >= 1,
    },
    {
      id: "sequences",
      label: "Build and approve a sequence",
      description:
        "Assemble templates into a sequence, set step delays, and get it approved before enrollment.",
      href: `${base}/outreach`,
      done: input.approvedSequencesCount >= 1,
    },
    {
      id: "enrollments",
      label: "Enroll contacts into the sequence",
      description:
        "Enroll eligible contacts so the sequence runner can send governed introductions and follow-ups.",
      href: `${base}/outreach`,
      done: input.enrolledContactsCount >= 1,
    },
    {
      id: "launch",
      label: "Check launch readiness",
      description:
        "Use the Launch readiness panel to confirm mailboxes, OAuth, suppression, and pilot are all green.",
      href: `${base}`,
      done: input.outreachPilotRunnable,
    },
  ];

  const completedCount = items.filter((item) => item.done).length;
  const totalCount = items.length;
  const allDone = completedCount === totalCount;

  const isOnboardingState = input.clientStatus === "ONBOARDING";
  const shouldRender = isOnboardingState || !allDone;

  return { shouldRender, totalCount, completedCount, items };
}
