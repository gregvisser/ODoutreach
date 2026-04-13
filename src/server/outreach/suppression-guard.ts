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
 * Recompute `Contact.isSuppressed` for all contacts in a client after suppression sync or bulk import.
 */
export async function refreshContactSuppressionFlagsForClient(
  clientId: string,
): Promise<void> {
  const contacts = await prisma.contact.findMany({
    where: { clientId },
    select: { id: true, email: true },
  });

  const now = new Date();
  const chunk = 40;
  for (let i = 0; i < contacts.length; i += chunk) {
    const slice = contacts.slice(i, i + chunk);
    await Promise.all(
      slice.map(async (c) => {
        const decision = await evaluateSuppression(clientId, c.email);
        await prisma.contact.update({
          where: { id: c.id },
          data: {
            isSuppressed: decision.suppressed,
            lastSuppressionCheckAt: now,
          },
        });
      }),
    );
  }
}

/** Parse a single cell from a domain suppression sheet (strips URL noise, normalizes). */
export function normalizeSuppressionDomainCell(raw: string): string {
  return normalizeDomain(raw);
}
