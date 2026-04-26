import type { SenderReadinessCheck, SenderReadinessReport } from "@/lib/sender-readiness";

/** Dropped in Mailboxes → Advanced: transport / legacy-ESP admin-only items. */
export const MAILBOXES_SENDER_READINESS_EXCLUDED_CHECK_IDS = new Set([
  "legacy_esp",
  "resend_verification",
]);

/**
 * Strips environment keys and app-internals that operators on Mailboxes do not
 * need (even in Advanced, we keep the screen operator-safe).
 */
export function scrubOperatorReadinessVisibleText(
  s: string | undefined,
): string | undefined {
  if (s == null) return s;
  let t = s;
  t = t.replace(/\bALLOWED_SENDER_EMAIL_DOMAINS\b/g, "the sender allowlist");
  t = t.replace(/\bEMAIL_PROVIDER\b/g, "platform email");
  t = t.replace(/mock\/Resend/gi, "the platform default (non-mailbox) mode");
  t = t.replace(/\bResend\b/g, "the platform email system");
  t = t.replace(/legacy-ESP/gi, "older non-mailbox");
  t = t.replace(/\(legacy-only view\)/gi, "(limited data in this view)");
  return t;
}

export function filterSenderReadinessChecksForMailboxesOperator(
  checks: readonly SenderReadinessCheck[],
): SenderReadinessCheck[] {
  return checks
    .filter((c) => !MAILBOXES_SENDER_READINESS_EXCLUDED_CHECK_IDS.has(c.id))
    .map((c) => ({
      ...c,
      label: scrubOperatorReadinessVisibleText(c.label) ?? c.label,
      detail: scrubOperatorReadinessVisibleText(c.detail) ?? c.detail,
    }));
}

/**
 * Replaces the technical sender-readiness summary (which may name legacy stack
 * pieces) with operator copy for the Mailboxes advanced panel.
 */
export function readinessSummaryForMailboxesOperator(
  r: SenderReadinessReport,
): string {
  if (r.headline === "blocked_by_domain_policy") {
    return "The sender preview address’s domain is not allowed for your workspace. Fix the domain, pick another mailbox, or have an admin adjust the allowlist in the operations area.";
  }
  if (r.headline === "mailbox_outreach_ready") {
    return "Client outreach is designed to send from your connected Microsoft 365 or Google Workspace mailboxes. Delivery and reputation follow that mailbox, not a separate global system.";
  }
  if (r.headline === "mailboxes_need_connection") {
    return "There are mailbox records, but at least one must be connected to Microsoft or Google and enabled for send before client outreach can use the pool normally.";
  }
  if (r.headline === "needs_verification") {
    return "A workspace or governance step may still require a verified sender in the operations area. Normal prospect outreach is still through connected mailboxes when they are set up here.";
  }
  if (r.headline === "ready") {
    return "The workspace and sender options look consistent for the flows in use, including the connected mailbox path.";
  }
  if (r.headline === "mock_dev" || r.headline === "not_configured") {
    if (r.outreachSendsVia === "unassessed") {
      return "Mailboxes are the primary send path. If mailbox data is missing in this view, add or open mailboxes in this list so the status here reflects how outreach will send.";
    }
    if (r.outreachSendsVia === "mailboxes" || r.outreachSendsVia === "legacy_esp_only") {
      return "Set up your workspace mailboxes above. Client outreach is meant to go through the connected address pool, not a generic platform default.";
    }
    return "Set up a workspace default From or connect a mailbox, depending on the outreach flow your organisation uses. Ask an admin if an older, non-mailbox path still exists.";
  }
  return "Review Mailboxes and the operations area with an administrator if sending still looks wrong.";
}

export function deliveryLineForMailboxesOperator(
  r: SenderReadinessReport,
): string {
  if (r.outreachSendsVia === "mailboxes") {
    return "connected Microsoft 365 and Google mailboxes in this client pool";
  }
  if (r.outreachSendsVia === "unassessed") {
    return "add mailboxes here to use the client pool (this summary may be incomplete without rows)";
  }
  return "connect a mailbox in this pool, then enable it for client outreach";
}
