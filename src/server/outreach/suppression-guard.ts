import "server-only";

import { prisma } from "@/lib/db";
import {
  extractDomainFromEmail,
  normalizeDomain,
  normalizeEmail,
} from "@/lib/normalize";

export type SuppressionDecision = {
  suppressed: boolean;
  reason: "email_list" | "domain_list" | "none";
  normalizedEmail: string;
  normalizedDomain: string;
  matchedEmail?: string;
  matchedDomain?: string;
};

/**
 * Authoritative suppression check for a recipient within one tenant.
 * Call this (or `isAddressSuppressed`) before enqueueing any outbound send.
 */
export async function evaluateSuppression(
  clientId: string,
  email: string,
): Promise<SuppressionDecision> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedDomain = normalizeDomain(extractDomainFromEmail(normalizedEmail));

  const [emailHit, domainHit] = await Promise.all([
    prisma.suppressedEmail.findUnique({
      where: {
        clientId_email: { clientId, email: normalizedEmail },
      },
    }),
    normalizedDomain
      ? prisma.suppressedDomain.findUnique({
          where: {
            clientId_domain: {
              clientId,
              domain: normalizedDomain,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  if (emailHit) {
    return {
      suppressed: true,
      reason: "email_list",
      normalizedEmail,
      normalizedDomain,
      matchedEmail: emailHit.email,
    };
  }

  if (domainHit) {
    return {
      suppressed: true,
      reason: "domain_list",
      normalizedEmail,
      normalizedDomain,
      matchedDomain: domainHit.domain,
    };
  }

  return {
    suppressed: false,
    reason: "none",
    normalizedEmail,
    normalizedDomain,
  };
}

/** Narrow boolean for simple gates; prefer `evaluateSuppression` when you need audit detail. */
export async function isAddressSuppressed(
  clientId: string,
  email: string,
): Promise<boolean> {
  const d = await evaluateSuppression(clientId, email);
  return d.suppressed;
}

/**
 * PR F2: pure classifier for one contact's refresh outcome.
 *
 * Decoupled from Prisma so the null-email skip rule is unit-testable
 * without spinning up the database. Inputs are the contact's current
 * email and the evaluated suppression decision (pass `null` when the
 * email was null — callers must not invoke `evaluateSuppression` on a
 * null address because `normalizeEmail(null)` would throw).
 */
export type SuppressionRefreshOutcome =
  | "skipped_missing_email"
  | "marked_suppressed"
  | "marked_clear";

export function classifySuppressionRefresh(
  email: string | null | undefined,
  decision: SuppressionDecision | null,
): SuppressionRefreshOutcome {
  if (!email) return "skipped_missing_email";
  if (decision && decision.suppressed) return "marked_suppressed";
  return "marked_clear";
}

export type SuppressionRefreshSummary = {
  total: number;
  /** Contacts where `isSuppressed` was set to true this run. */
  suppressed: number;
  /** Contacts where `isSuppressed` was set to false this run. */
  cleared: number;
  /**
   * PR F2: contacts that were stamped with `lastSuppressionCheckAt` but
   * skipped the evaluate/normalize pipeline because they have no email
   * address. They remain `isSuppressed=false` by design — a no-email
   * contact is valid-but-not-email-sendable and cannot match an email
   * suppression row.
   */
  skippedMissingEmail: number;
};

/**
 * Recompute `Contact.isSuppressed` for all contacts in a client after
 * suppression sync or bulk import.
 *
 * PR F2: now returns a `SuppressionRefreshSummary`. Existing callers
 * discard the return value so this is additive and non-breaking.
 */
export async function refreshContactSuppressionFlagsForClient(
  clientId: string,
): Promise<SuppressionRefreshSummary> {
  const contacts = await prisma.contact.findMany({
    where: { clientId },
    select: { id: true, email: true },
  });

  const now = new Date();
  const chunk = 40;
  let suppressed = 0;
  let cleared = 0;
  let skippedMissingEmail = 0;

  for (let i = 0; i < contacts.length; i += chunk) {
    const slice = contacts.slice(i, i + chunk);
    const outcomes = await Promise.all(
      slice.map(async (c): Promise<SuppressionRefreshOutcome> => {
        // PR F1: a contact with no email cannot be on an email-suppression
        // list (suppression is keyed on an email string). Stamp the check
        // timestamp and leave `isSuppressed` as-is (false for new rows).
        // Domain-level suppression matching is still impossible without an
        // address. This intentionally does NOT surface as suppressed so
        // the contact remains "valid but not email-sendable".
        if (!c.email) {
          await prisma.contact.update({
            where: { id: c.id },
            data: {
              isSuppressed: false,
              lastSuppressionCheckAt: now,
            },
          });
          return classifySuppressionRefresh(c.email, null);
        }
        const decision = await evaluateSuppression(clientId, c.email);
        await prisma.contact.update({
          where: { id: c.id },
          data: {
            isSuppressed: decision.suppressed,
            lastSuppressionCheckAt: now,
          },
        });
        return classifySuppressionRefresh(c.email, decision);
      }),
    );
    for (const outcome of outcomes) {
      if (outcome === "skipped_missing_email") skippedMissingEmail += 1;
      else if (outcome === "marked_suppressed") suppressed += 1;
      else if (outcome === "marked_clear") cleared += 1;
    }
  }

  return {
    total: contacts.length,
    suppressed,
    cleared,
    skippedMissingEmail,
  };
}

/** Parse a single cell from a domain suppression sheet (strips URL noise, normalizes). */
export function normalizeSuppressionDomainCell(raw: string): string {
  return normalizeDomain(raw);
}
