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
    label: "Workspace default From address",
    state: input.defaultSenderEmail?.trim() ? "pass" : "warn",
    detail: input.defaultSenderEmail?.trim()
      ? "Set on this client"
      : "Not set — using DEFAULT_OUTBOUND_FROM or platform fallback",
  });

  checks.push({
    id: "allowlist",
    label: "Domain allowlist (ALLOWED_SENDER_EMAIL_DOMAINS)",
    state: process.env.ALLOWED_SENDER_EMAIL_DOMAINS?.trim()
      ? blockedDomain
        ? "fail"
        : "pass"
      : "na",
    detail: process.env.ALLOWED_SENDER_EMAIL_DOMAINS?.trim()
      ? blockedDomain
        ? `Domain "${blockedDomain}" is not in the allowlist — sends will throw at execution.`
        : "Sender domain is allowed."
      : "Not enforced — any resolved From domain is accepted by the app.",
  });

  checks.push({
    id: "identity_enum",
    label: "Recorded identity status (manual in app)",
    state:
      input.senderIdentityStatus === "VERIFIED_READY"
        ? "pass"
        : input.senderIdentityStatus === "CONFIGURED_UNVERIFIED"
          ? "warn"
          : "warn",
    detail:
      input.senderIdentityStatus === "NOT_SET"
        ? "NOT_SET — configure default sender and mark verified when Resend is ready."
        : input.senderIdentityStatus === "CONFIGURED_UNVERIFIED"
          ? "Address configured; operators must mark VERIFIED_READY after Resend domain/sender checks."
          : "VERIFIED_READY — aligned with operational checklist for real ESP.",
  });

  if (providerMode === "resend") {
    checks.push({
      id: "resend_verification",
      label: "Resend production readiness",
      state:
        blockedDomain
          ? "fail"
          : input.senderIdentityStatus === "VERIFIED_READY"
            ? "pass"
            : "warn",
      detail: blockedDomain
        ? "Fix domain allowlist before any live send."
        : input.senderIdentityStatus === "VERIFIED_READY"
          ? "Identity marked ready — still verify domain/DKIM in Resend dashboard independently."
          : "Resend may reject or throttle until domain/sender is verified in Resend; mark VERIFIED_READY in Operations after verification.",
    });
  } else {
    checks.push({
      id: "resend_verification",
      label: "Resend production readiness",
      state: "na",
      detail: "EMAIL_PROVIDER is mock — no real ESP; use for local/staging functional tests only.",
    });
  }

  if (usedFallback) {
    checks.push({
      id: "fallback",
      label: "Fallback From address",
      state: "warn",
      detail: `Effective From resolves to ${from} — set Client.defaultSenderEmail for a client-specific envelope.`,
    });
  }

  let headline: SenderReadinessHeadline;
  let summary: string;

  if (providerMode === "mock") {
    headline = "mock_dev";
    summary =
      "Mock provider: no network sends. Use for development; switch EMAIL_PROVIDER=resend for real ESP.";
  } else if (blockedDomain) {
    headline = "blocked_by_domain_policy";
    summary = `Sender domain is not allowed by ALLOWED_SENDER_EMAIL_DOMAINS — configure an allowed domain or adjust the allowlist before sending.`;
  } else if (!input.defaultSenderEmail?.trim()) {
    headline = "not_configured";
    summary =
      "No workspace default sender — sends use env/platform fallback; set defaultSenderEmail and verify in Resend for production.";
  } else if (input.senderIdentityStatus !== "VERIFIED_READY") {
    headline = "needs_verification";
    summary =
      "Default sender is set but identity is not VERIFIED_READY — confirm domain/sender in Resend, then mark ready in Operations.";
  } else {
    headline = "ready";
    summary =
      "Configured and marked VERIFIED_READY — confirm DNS/DKIM in Resend remains healthy for production.";
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
