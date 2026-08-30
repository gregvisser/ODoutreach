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

/**
 * Row 111 finding 2 — the Do-not-contact tab's "isn't set up yet" banner is
 * gated on one GLOBAL credential (the shared Google service account), while
 * the "Sheet connected" / "Last sync succeeded" text right below it reflects
 * a PER-CLIENT fact that survives the global credential being removed or
 * rotated out. Answering the same on-screen question two different ways
 * reads as a contradiction. `hasPriorSuccessfulSync` tells this which of the
 * two true situations the client is actually in.
 */
export function suppressionSyncUnavailableCopy(
  hasPriorSuccessfulSync: boolean,
): { title: string; body: string } {
  if (hasPriorSuccessfulSync) {
    return {
      title: "Sync is currently unavailable",
      body: "The list below is frozen as of its last successful sync — an administrator needs to reconnect Google Sheets sync before new changes in the Sheet come through. Manual blocks above still work.",
    };
  }
  return {
    title: "Google Sheets sync isn't set up yet",
    body: "Ask an administrator to connect Google Sheets sync (a one-time setup). Once it's on, you just paste a Sheet URL here.",
  };
}

/**
 * Row 111 finding 3 — the ONE test for "is this suppression source actually
 * connected", shared by the Overview readiness row (which already used this
 * exact predicate via `client.suppressionSources.filter((s) =>
 * !!s.spreadsheetId?.trim())` in `client-workspace-bundle.ts`) and the
 * Do-not-contact tab's own "Sheet connected." badge (which used to check
 * only that a source row existed at all). A source row existing with no
 * working `spreadsheetId` is not connected by either screen's own logic —
 * before this, only the Overview screen enforced that.
 */
export function suppressionSourceIsConnected(
  source: { spreadsheetId: string | null } | null | undefined,
): boolean {
  return !!source?.spreadsheetId?.trim();
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
