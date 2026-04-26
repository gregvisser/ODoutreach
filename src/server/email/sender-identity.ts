import "server-only";

import { normalizeEmail } from "@/lib/normalize";
import type { SenderIdentityStatus } from "@/generated/prisma/enums";

export type ResolvedSender = {
  from: string;
  identityStatus: SenderIdentityStatus;
  /** When true, real ESP may reject until domain is verified in provider dashboard */
  verificationRequired: boolean;
  warnings: string[];
};

/**
 * Resolves and validates From address for an outbound send. Conservative defaults.
 * `ALLOWED_SENDER_EMAIL_DOMAINS` — optional comma-separated list of allowed From domains (lowercase).
 */
export function resolveValidatedSenderForClient(input: {
  clientDefaultSenderEmail: string | null;
  clientSenderIdentityStatus: SenderIdentityStatus;
  rowFromAddress: string | null;
}): ResolvedSender {
  const warnings: string[] = [];
  const envFrom = process.env.DEFAULT_OUTBOUND_FROM?.trim() ?? null;
  const fallback = `noreply@opensdoors.local`;

  const raw =
    input.rowFromAddress?.trim() ||
    input.clientDefaultSenderEmail?.trim() ||
    envFrom ||
    fallback;

  let from = normalizeEmail(raw);
  if (!from.includes("@")) {
    warnings.push("Invalid sender address shape — using fallback");
    from = normalizeEmail(fallback);
  }

  const domain = from.split("@")[1]?.toLowerCase() ?? "";
  const allow = process.env.ALLOWED_SENDER_EMAIL_DOMAINS?.trim();
  if (allow) {
    const allowed = new Set(
      allow.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
    );
    if (!allowed.has(domain)) {
      throw new Error(
        `Sender domain "${domain}" is not in ALLOWED_SENDER_EMAIL_DOMAINS — configure Client.defaultSenderEmail or env allowlist.`,
      );
    }
  }

  if (!input.clientDefaultSenderEmail?.trim() && !input.rowFromAddress?.trim()) {
    warnings.push("Using global DEFAULT_OUTBOUND_FROM or platform fallback — set Client.defaultSenderEmail for this workspace.");
  }

  // Legacy-ESP / non-mailbox path only: rows with a mailbox use Graph/Gmail in the worker.
  const providerMode = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase().trim();
  const verificationRequired =
    providerMode === "resend" && input.clientSenderIdentityStatus !== "VERIFIED_READY";

  if (verificationRequired) {
    warnings.push(
      "Sender identity is not VERIFIED_READY — if this send used the Resend transport, Resend may reject until domain/sender is verified in Resend.",
    );
  }

  return {
    from,
    identityStatus: input.clientSenderIdentityStatus,
    verificationRequired,
    warnings,
  };
}
