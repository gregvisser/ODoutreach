/**
 * PR #138 — staff-friendly labels for the Do-not-contact UI.
 *
 * The raw Prisma enums (`SuppressionListKind`, `SuppressionSyncStatus`) are
 * fine in code but read as developer jargon in the staff UI. These helpers
 * turn them into short sentence-case labels so the Do-not-contact pages
 * never render bare values like `EMAIL` / `NOT_CONFIGURED` to staff.
 */

export type SuppressionKindRaw = "EMAIL" | "DOMAIN";

export function suppressionKindLabel(kind: SuppressionKindRaw | string): string {
  switch (kind) {
    case "EMAIL":
      return "Email addresses";
    case "DOMAIN":
      return "Whole domains";
    default:
      return "Other source";
  }
}

export function suppressionKindShortLabel(
  kind: SuppressionKindRaw | string,
): string {
  switch (kind) {
    case "EMAIL":
      return "Emails";
    case "DOMAIN":
      return "Domains";
    default:
      return "Other";
  }
}

export type SuppressionSyncStatusRaw =
  | "NOT_CONFIGURED"
  | "IDLE"
  | "SYNCING"
  | "SUCCESS"
  | "ERROR";

export function suppressionSyncStatusLabel(
  status: SuppressionSyncStatusRaw | string,
): string {
  switch (status) {
    case "NOT_CONFIGURED":
      return "Not connected";
    case "IDLE":
      return "Connected — never synced";
    case "SYNCING":
      return "Sync in progress";
    case "SUCCESS":
      return "Last sync succeeded";
    case "ERROR":
      return "Last sync failed";
    default:
      return "Unknown";
  }
}

export function suppressionSyncStatusBadgeVariant(
  status: SuppressionSyncStatusRaw | string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "SUCCESS":
      return "default";
    case "SYNCING":
      return "secondary";
    case "ERROR":
      return "destructive";
    case "NOT_CONFIGURED":
    case "IDLE":
    default:
      return "outline";
  }
}
