/**
 * Staff-facing copy for the Outreach tab (live sequence workflow).
 * Keep server actions and policy enums unchanged — this layer is display only.
 */

export const OUTREACH_PAGE_TITLE = "Outreach";

export const OUTREACH_PAGE_SUBTITLE =
  "Create and launch live email sequences for this client.";

/** Compact step guide shown at the top of Outreach. */
export const OUTREACH_WORKFLOW_STEPS = [
  "Choose list",
  "Choose mailbox",
  "Choose emails",
  "Review recipients",
  "Launch",
] as const;

/** Badge labels for sequence lifecycle — maps Prisma sequence status. */
export const OUTREACH_SEQUENCE_STATUS_LABELS = {
  DRAFT: "Draft",
  READY_FOR_REVIEW: "Ready",
  APPROVED: "Live",
  ARCHIVED: "Archived",
} as const;

export type OutreachSequenceStatusKey = keyof typeof OUTREACH_SEQUENCE_STATUS_LABELS;

export function outreachSequenceStatusLabel(
  status: string,
): string {
  const key = status as OutreachSequenceStatusKey;
  return OUTREACH_SEQUENCE_STATUS_LABELS[key] ?? status;
}
