/**
 * Shared human-friendly labels for operator-facing UI.
 *
 * Every enum that might appear in a table, badge, or status chip should go
 * through one of these maps instead of being rendered raw. The raw values
 * (ALL_CAPS, snake_case) are useful to developers; operators see the labels.
 */

export const STAFF_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  OPERATOR: "Operator",
  VIEWER: "Viewer",
};

export function staffRoleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return STAFF_ROLE_LABELS[role] ?? role;
}

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export function clientStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return CLIENT_STATUS_LABELS[status] ?? status;
}

/**
 * Semantic badge colour classes for a client lifecycle status. Use with
 * `<Badge variant="outline" className={clientStatusBadgeClassName(status)}>`
 * so the state reads at a glance: active = green, onboarding = amber,
 * paused = blue, archived/other = neutral.
 */
export function clientStatusBadgeClassName(
  status: string | null | undefined,
): string {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
    case "ONBOARDING":
      return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";
    case "PAUSED":
      return "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export const OUTBOUND_STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  PROCESSING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  REPLIED: "Replied",
  BOUNCED: "Bounced",
  FAILED: "Failed",
  BLOCKED: "Blocked",
  SUPPRESSED: "Suppressed",
  CANCELLED: "Cancelled",
};

export function outboundStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return OUTBOUND_STATUS_LABELS[status] ?? status;
}

export const MAILBOX_PROVIDER_LABELS: Record<string, string> = {
  MICROSOFT: "Microsoft 365",
  GOOGLE: "Google Workspace",
};

export function mailboxProviderLabel(
  provider: string | null | undefined,
): string {
  if (!provider) return "—";
  return MAILBOX_PROVIDER_LABELS[provider] ?? provider;
}

export const MAILBOX_CONNECTION_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_CONNECTION: "Not connected",
  CONNECTED: "Connected",
  REVOKED: "Revoked",
  ERROR: "Connection error",
  DISABLED: "Disabled",
};

export function mailboxConnectionLabel(
  status: string | null | undefined,
): string {
  if (!status) return "—";
  return MAILBOX_CONNECTION_LABELS[status] ?? status;
}

export const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  READY_FOR_REVIEW: "In review",
  APPROVED: "Saved",
  ARCHIVED: "Archived",
};

export function templateStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return TEMPLATE_STATUS_LABELS[status] ?? status;
}

export const SEND_KIND_LABELS: Record<string, string> = {
  GOVERNED_TEST: "Internal test",
  CONTROLLED_PILOT: "Pilot",
  LIVE_PROSPECT: "Live prospect",
};

export function sendKindLabel(kind: string | null | undefined): string {
  if (!kind) return "—";
  return SEND_KIND_LABELS[kind] ?? kind;
}
