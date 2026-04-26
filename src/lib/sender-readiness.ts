import "server-only";

import { normalizeEmail } from "@/lib/normalize";
import type { SenderIdentityStatus } from "@/generated/prisma/enums";
import {
  summarizeOutreachMailboxes,
  type MailboxOutreachRowInput,
} from "@/lib/outreach-mailbox-transport";

export type SenderReadinessHeadline =
  | "ready"
  | "mock_dev"
  | "needs_verification"
  | "not_configured"
  | "blocked_by_domain_policy"
  | "mailbox_outreach_ready"
  | "mailboxes_need_connection";

export type SenderReadinessCheckState = "pass" | "warn" | "fail" | "na";

export type SenderReadinessCheck = {
  id: string;
  label: string;
  state: SenderReadinessCheckState;
  detail?: string;
};

/** How normal client outreach is delivered (sequence/contact rows with mailbox id). */
export type OutreachSendsVia = "mailboxes" | "legacy_esp_only" | "unassessed";

export type SenderReadinessReport = {
  headline: SenderReadinessHeadline;
  /** Short operator-facing summary */
  summary: string;
  effectiveFrom: string;
  /**
   * Legacy `EMAIL_PROVIDER` (mock/Resend) for outbound rows **without** a
   * `mailboxIdentityId` — not the primary client outreach model.
   */
  providerMode: "mock" | "resend";
  /**
   * Whether this assessment had mailbox row data. When `unassessed`, headline
   * may fall back to global ESP (e.g. operations table before mailboxes are loaded).
   */
  outreachSendsVia: OutreachSendsVia;
  identityStatus: SenderIdentityStatus;
  checks: SenderReadinessCheck[];
};

function resolveEffectiveFromPreview(input: {
  defaultSenderEmail: string | null;
  outreachPreviewFromMailbox: string | null;
}): { from: string; usedFallback: boolean } {
  const envFrom = process.env.DEFAULT_OUTBOUND_FROM?.trim() ?? null;
  const fallback = "noreply@opensdoors.local";
  const raw =
    input.defaultSenderEmail?.trim() ||
    input.outreachPreviewFromMailbox?.trim() ||
    envFrom ||
    fallback;
  let from = normalizeEmail(raw);
  if (!from.includes("@")) {
    from = normalizeEmail(fallback);
  }
  const usedFallback =
    !input.defaultSenderEmail?.trim() &&
    !input.outreachPreviewFromMailbox?.trim() &&
    !envFrom?.trim();
  return { from, usedFallback };
}

function domainAllowlistViolation(from: string): string | null {
  const allow = process.env.ALLOWED_SENDER_EMAIL_DOMAINS?.trim();
  if (!allow) return null;
  const domain = from.split("@")[1]?.toLowerCase() ?? "";
  const allowed = new Set(
    allow.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
  );
  if (!allowed.has(domain)) {
    return domain;
  }
  return null;
}

/**
 * Non-throwing readiness for UI/ops. Client **outreach** (sequences, contact
 * sends) uses the connected Microsoft/Google mailbox pool in the worker
 * (`executeOutboundSend` when `mailboxIdentityId` is set). Global
 * `EMAIL_PROVIDER` (mock/Resend) is only for legacy `OutboundEmail` rows
 * without a mailbox link.
 */
export function describeSenderReadiness(input: {
  defaultSenderEmail: string | null;
  senderIdentityStatus: SenderIdentityStatus;
  /**
   * All workspace mailbox rows. When omitted, mailbox-native outreach cannot
   * be assessed; UI falls back to global ESP (mock/Resend) wording only.
   */
  outreachMailboxes?: MailboxOutreachRowInput[] | null;
}): SenderReadinessReport {
  const m = summarizeOutreachMailboxes(input.outreachMailboxes);
  const outreachSendsVia: OutreachSendsVia = input.outreachMailboxes
    ? m.hasMailboxNativeOutreachPath
      ? "mailboxes"
      : "legacy_esp_only"
    : "unassessed";

  const { from, usedFallback } = resolveEffectiveFromPreview({
    defaultSenderEmail: input.defaultSenderEmail,
    outreachPreviewFromMailbox: m.firstEligibleMailboxEmail,
  });

  const providerRaw = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase().trim();
  const providerMode = providerRaw === "resend" ? "resend" : "mock";
  const blockedDomain = domainAllowlistViolation(from);
  const checks: SenderReadinessCheck[] = [];
  const hasNative = m.hasMailboxNativeOutreachPath;

  checks.push({
    id: "outreach_mailbox_pool",
    label: "Workspace mailbox pool (client outreach)",
    state:
      input.outreachMailboxes == null
        ? "na"
        : m.hasAnyMailboxRow
          ? hasNative
            ? "pass"
            : "fail"
          : "warn",
    detail:
      input.outreachMailboxes == null
        ? "Connect Microsoft or Google mailboxes in Mailboxes. Assessment did not include mailbox row data (legacy-only view)."
        : !m.hasAnyMailboxRow
          ? "No mailboxes on file — add at least one workspace mailbox. Client outreach is designed to send from connected Microsoft 365 or Google accounts."
          : hasNative
            ? `${m.eligibleCount} mailbox address(es) connected and send-enabled. Outreach can use the shared pool (any authorised operator on this workspace; execution picks an eligible mailbox per send).`
            : "At least one mailbox row exists, but none are both CONNECTED and send-enabled. Finish OAuth/reconnect, then enable send on the row.",
  });

  checks.push({
    id: "default_sender",
    label: "Workspace default From (preview for legacy / templates)",
    state: input.defaultSenderEmail?.trim() ? "pass" : hasNative ? "warn" : "warn",
    detail: input.defaultSenderEmail?.trim()
      ? "A client-level default From address is set. Individual sends use the selected mailbox; this helps previews and any legacy path without a mailbox id."
      : hasNative
        ? "No client-level default is set; outreach preview can use a connected mailbox address. Set a default in the operations area if you want a single workspace-wide preview."
        : "No client-specific default — a platform or placeholder preview may be used until mailboxes and defaults are set.",
  });

  checks.push({
    id: "allowlist",
    label: "Sender domain allowlist",
    state: process.env.ALLOWED_SENDER_EMAIL_DOMAINS?.trim()
      ? blockedDomain
        ? "fail"
        : "pass"
      : "na",
    detail: process.env.ALLOWED_SENDER_EMAIL_DOMAINS?.trim()
      ? blockedDomain
        ? `The preview domain "${blockedDomain}" is not on ALLOWED_SENDER_EMAIL_DOMAINS.`
        : "The preview sender domain is allowed."
      : "No allowlist is enforced for preview resolution — providers enforce your real mailbox domains on send.",
  });

  checks.push({
    id: "identity_enum",
    label: "Client sender marked ready (operations)",
    state:
      input.senderIdentityStatus === "VERIFIED_READY"
        ? "pass"
        : input.senderIdentityStatus === "CONFIGURED_UNVERIFIED"
          ? "warn"
          : "warn",
    detail:
      input.senderIdentityStatus === "NOT_SET"
        ? "Not marked ready in OpensDoors — required for some governance steps and legacy-ESP rows if used."
        : input.senderIdentityStatus === "CONFIGURED_UNVERIFIED"
          ? "Address recorded but not marked VERIFIED_READY in the operations area."
          : "Marked ready for workspace-level operations.",
  });

  if (hasNative) {
    checks.push({
      id: "legacy_esp",
      label: "Global transport (EMAIL_PROVIDER) — not primary for outreach",
      state: "na",
      detail:
        providerMode === "mock"
          ? "Outreach sends to prospects use your connected Microsoft/Google mailboxes, not the global mock provider. EMAIL_PROVIDER=mock only affects old outbound rows without a mailbox id (e.g. legacy or tests)."
          : "Outreach uses connected mailboxes. A configured Resend key (EMAIL_PROVIDER=resend) is for legacy ESP rows and platform mail — not the normal client outreach path.",
    });
  } else if (providerMode === "resend") {
    checks.push({
      id: "resend_verification",
      label: "Resend (legacy / non-mailbox rows)",
      state: blockedDomain
        ? "fail"
        : input.senderIdentityStatus === "VERIFIED_READY"
          ? "pass"
          : "warn",
      detail: blockedDomain
        ? "Fix the sender domain allowlist before any legacy-ESP send."
        : input.senderIdentityStatus === "VERIFIED_READY"
          ? "Marked ready for any row that still uses the Resend transport."
          : "Resend may reject or throttle legacy-ESP rows until the sender is verified in Resend and here.",
    });
  } else {
    checks.push({
      id: "resend_verification",
      label: "Global email transport (legacy rows)",
      state: "na",
      detail:
        m.hasAnyMailboxRow && !hasNative
          ? "No eligible mailbox in the pool — fix connections first. The global mock provider (EMAIL_PROVIDER) does not deliver to real inboxes for rows without a mailbox id."
          : "Non-sending or mock global transport. Connect work mailboxes for real client outreach; that path does not depend on Resend when rows carry a mailbox id.",
    });
  }

  if (usedFallback) {
    checks.push({
      id: "fallback",
      label: "Using placeholder preview address",
      state: hasNative ? "warn" : "warn",
      detail: hasNative
        ? "Preview can still show a placeholder; live sends go from the connected mailboxes. Set a workspace default From or rely on a mailbox for clearer previews."
        : `Sends for rows without a mailbox will use a placeholder until a default is set. (${from})`,
    });
  }

  let headline: SenderReadinessHeadline;
  let summary: string;

  if (blockedDomain) {
    headline = "blocked_by_domain_policy";
    summary =
      "The sender preview domain is not on the allowlist. Fix ALLOWED_SENDER_EMAIL_DOMAINS or use an allowed default From / mailbox address.";
  } else if (hasNative) {
    headline = "mailbox_outreach_ready";
    summary =
      "Client outreach can send from your connected Microsoft 365 or Google Workspace mailboxes (shared pool). Message delivery and reputation follow each mailbox’s provider, not a global Resend default.";
  } else if (m.hasAnyMailboxRow && !hasNative) {
    headline = "mailboxes_need_connection";
    summary =
      "Mailbox rows exist but none are both connected and send-enabled. Finish connect/reconnect and turn send on; live outreach is mailbox-native, not a global Resend test.";
  } else if (outreachSendsVia === "unassessed" && providerMode === "mock") {
    headline = "mock_dev";
    summary =
      "Legacy global transport is set to mock (or unset). This does not, by itself, describe a workspace with connected mailboxes — add mailbox row data to assess outreach delivery.";
  } else if (providerMode === "mock") {
    headline = "mock_dev";
    summary =
      "No send-eligible connected mailbox in this workspace yet, and the legacy global transport is non-sending. Connect a workspace mailbox to send real outreach, or use Resend only for the rare legacy/ESP path.";
  } else if (!input.defaultSenderEmail?.trim()) {
    headline = "not_configured";
    summary =
      "No client-level default From for any remaining legacy-ESP path. For normal outreach, connect a mailbox; Resend/verification mainly applies to rows without a mailbox id.";
  } else if (input.senderIdentityStatus !== "VERIFIED_READY") {
    headline = "needs_verification";
    summary =
      "Mark the client sender as verified in the operations area if you still use legacy-ESP or governance steps that read client-level status.";
  } else {
    headline = "ready";
    summary =
      "Workspace and legacy-ESP options are in a good state for the paths that do not use a shared mailbox id.";
  }

  return {
    headline,
    summary,
    effectiveFrom: from,
    providerMode,
    outreachSendsVia,
    identityStatus: input.senderIdentityStatus,
    checks,
  };
}
