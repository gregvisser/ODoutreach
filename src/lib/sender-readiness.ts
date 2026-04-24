import "server-only";

import { normalizeEmail } from "@/lib/normalize";
import type { SenderIdentityStatus } from "@/generated/prisma/enums";

export type SenderReadinessHeadline =
  | "ready"
  | "mock_dev"
  | "needs_verification"
  | "not_configured"
  | "blocked_by_domain_policy";

export type SenderReadinessCheckState = "pass" | "warn" | "fail" | "na";

export type SenderReadinessCheck = {
  id: string;
  label: string;
  state: SenderReadinessCheckState;
  detail?: string;
};

export type SenderReadinessReport = {
  headline: SenderReadinessHeadline;
  /** Short operator-facing summary */
  summary: string;
  effectiveFrom: string;
  providerMode: "mock" | "resend";
  identityStatus: SenderIdentityStatus;
  checks: SenderReadinessCheck[];
};

function resolveEffectiveFromPreview(input: {
  defaultSenderEmail: string | null;
}): { from: string; usedFallback: boolean } {
  const envFrom = process.env.DEFAULT_OUTBOUND_FROM?.trim() ?? null;
  const fallback = "noreply@opensdoors.local";
  const raw =
    input.defaultSenderEmail?.trim() || envFrom || fallback;
  let from = normalizeEmail(raw);
  if (!from.includes("@")) {
    from = normalizeEmail(fallback);
  }
  const usedFallback =
    !input.defaultSenderEmail?.trim() && !envFrom?.trim();
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
 * Non-throwing readiness breakdown for UI and ops — mirrors constraints in
 * `resolveValidatedSenderForClient` without performing a send.
 */
export function describeSenderReadiness(input: {
  defaultSenderEmail: string | null;
  senderIdentityStatus: SenderIdentityStatus;
}): SenderReadinessReport {
  const providerRaw = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase().trim();
  const providerMode = providerRaw === "resend" ? "resend" : "mock";
  const { from, usedFallback } = resolveEffectiveFromPreview(input);
  const blockedDomain = domainAllowlistViolation(from);
  const checks: SenderReadinessCheck[] = [];

  checks.push({
    id: "default_sender",
    label: "Default From address",
    state: input.defaultSenderEmail?.trim() ? "pass" : "warn",
    detail: input.defaultSenderEmail?.trim()
      ? "A client-specific From address is set."
      : "No client-specific From address — a platform fallback is being used.",
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
        ? `The sender domain "${blockedDomain}" isn't on the workspace allowlist — sends will be blocked until it's added.`
        : "The sender domain is allowed."
      : "No allowlist is enforced — any resolved sender domain is accepted.",
  });

  checks.push({
    id: "identity_enum",
    label: "Sender marked verified in OpensDoors",
    state:
      input.senderIdentityStatus === "VERIFIED_READY"
        ? "pass"
        : input.senderIdentityStatus === "CONFIGURED_UNVERIFIED"
          ? "warn"
          : "warn",
    detail:
      input.senderIdentityStatus === "NOT_SET"
        ? "Not yet marked ready. An operator confirms the sender is verified after setting it up in the email provider."
        : input.senderIdentityStatus === "CONFIGURED_UNVERIFIED"
          ? "The sender address is set but hasn't been confirmed yet. An operator marks it ready once the provider shows verified."
          : "An operator has confirmed this sender is ready to use for live outreach.",
  });

  if (providerMode === "resend") {
    checks.push({
      id: "resend_verification",
      label: "Email provider verification",
      state:
        blockedDomain
          ? "fail"
          : input.senderIdentityStatus === "VERIFIED_READY"
            ? "pass"
            : "warn",
      detail: blockedDomain
        ? "Fix the sender domain allowlist before any live send."
        : input.senderIdentityStatus === "VERIFIED_READY"
          ? "Marked ready in OpensDoors. Make sure DKIM and the sending domain also show verified in the email provider's dashboard."
          : "The email provider may reject or throttle sends until the sender domain is verified on their side.",
    });
  } else {
    checks.push({
      id: "resend_verification",
      label: "Email provider verification",
      state: "na",
      detail:
        "Mock email transport — no messages are delivered to real inboxes. Production uses a live provider (EMAIL_PROVIDER).",
    });
  }

  if (usedFallback) {
    checks.push({
      id: "fallback",
      label: "Using fallback From address",
      state: "warn",
      detail: `Sends will go out as ${from} until a client-specific default sender is set.`,
    });
  }

  let headline: SenderReadinessHeadline;
  let summary: string;

  if (providerMode === "mock") {
    headline = "mock_dev";
    summary =
      "Mock email transport is active — no real messages are sent. Configure a live email provider in hosting (EMAIL_PROVIDER) for production delivery.";
  } else if (blockedDomain) {
    headline = "blocked_by_domain_policy";
    summary =
      "The sender's domain isn't on the allowlist. Use a different sender address or ask an administrator to update the allowlist.";
  } else if (!input.defaultSenderEmail?.trim()) {
    headline = "not_configured";
    summary =
      "No client-specific sender is set. A platform fallback is being used — set a default From address on this client to go live cleanly.";
  } else if (input.senderIdentityStatus !== "VERIFIED_READY") {
    headline = "needs_verification";
    summary =
      "The sender address is set, but nobody has confirmed it's ready. Verify the sender in the email provider, then mark it ready in the operations area.";
  } else {
    headline = "ready";
    summary =
      "This sender is configured and verified — confirm DNS and DKIM still look healthy in the email provider's dashboard periodically.";
  }

  return {
    headline,
    summary,
    effectiveFrom: from,
    providerMode,
    identityStatus: input.senderIdentityStatus,
    checks,
  };
}
