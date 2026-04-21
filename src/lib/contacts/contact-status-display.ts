/**
 * PR F3 — shared display metadata for contact readiness statuses.
 *
 * Pure helper so the same label / tooltip / badge variant is used across
 * every contact surface (global `/contacts`, client email lists, outreach
 * enrollment previews). Keeping this in `lib/` (not `components/`) means
 * server components can import the metadata without pulling in React.
 *
 * Canonical statuses come from `lib/client-contacts-readiness.ts` and
 * were hardened in PR F2:
 *   - `email_sendable`: valid + has email (the ONLY state a send path
 *     will accept).
 *   - `valid_no_email`: has LinkedIn / phone, but no email address.
 *   - `suppressed`: excluded by client suppression rules.
 *   - `missing_identifier`: no email, LinkedIn, mobile, or office phone.
 */

import type { ContactReadinessStatusLabel } from "@/lib/client-contacts-readiness";

export type ContactStatusBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

export type ContactStatusDisplay = {
  label: string;
  tooltip: string;
  badgeVariant: ContactStatusBadgeVariant;
};

const CONTACT_STATUS_DISPLAY: Record<
  ContactReadinessStatusLabel,
  ContactStatusDisplay
> = {
  email_sendable: {
    label: "Email-sendable",
    tooltip: "Valid contact with an email address — eligible for sequences.",
    badgeVariant: "default",
  },
  valid_no_email: {
    label: "Valid, no email",
    tooltip:
      "Has LinkedIn or phone, but no email address — not eligible for email sends.",
    badgeVariant: "secondary",
  },
  suppressed: {
    label: "Suppressed",
    tooltip: "Excluded by client suppression rules.",
    badgeVariant: "destructive",
  },
  missing_identifier: {
    label: "Missing identifier",
    tooltip:
      "No email, LinkedIn, mobile, or office phone on file — cannot be reached.",
    badgeVariant: "outline",
  },
};

export function getContactStatusDisplay(
  status: ContactReadinessStatusLabel,
): ContactStatusDisplay {
  return CONTACT_STATUS_DISPLAY[status];
}

/**
 * "Missing email" is a KPI / summary bucket (synonym for `valid_no_email`
 * contacts) exposed on the client-contacts page KPI row. It is NOT a
 * per-contact readiness state — a contact either has no email AND some
 * other identifier (→ `valid_no_email`) or has no identifier at all
 * (→ `missing_identifier`).
 */
export const MISSING_EMAIL_KPI_DISPLAY = {
  label: "Missing email",
  tooltip:
    "Not suppressed and reachable by LinkedIn / phone, but no email on file.",
} as const;

export const MISSING_IDENTIFIER_KPI_DISPLAY = {
  label: "Missing identifier",
  tooltip: "No email, LinkedIn, mobile, or office phone on file.",
} as const;
