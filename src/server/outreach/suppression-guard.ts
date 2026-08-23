import "server-only";

import { prisma } from "@/lib/db";
import {
  extractDomainFromEmail,
  normalizeDomain,
  normalizeEmail,
  suppressionDomainCandidates,
} from "@/lib/normalize";
import { isInternalSeedAddress } from "@/server/internal-seed/seed-allowlist";

export type SuppressionDecision = {
  suppressed: boolean;
  reason: "email_list" | "domain_list" | "domain_family" | "none";
  normalizedEmail: string;
  normalizedDomain: string;
  matchedEmail?: string;
  matchedDomain?: string;
  /**
   * RULING 3 — set when the block came from an explicitly-listed related-company
   * family rather than a direct domain hit. Carries the human label ("BT") so an
   * operator asked "why was this blocked?" gets an answer they can act on.
   */
  matchedFamilyLabel?: string;
  /**
   * Feature A — set when the address is exempt because it is an active internal
   * seed/allowlist address (always deliverable). Only ever true when the
   * `INTERNAL_SEED_ALLOWLIST_ENABLED` flag is on. Additive/optional so the
   * shape is unchanged for every existing caller.
   */
  internalSeedExempt?: boolean;
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
  // The recipient's domain plus each of its parents, most specific first.
  const domainCandidates = suppressionDomainCandidates(normalizedDomain);

  // Feature A — internal seed / allowlist addresses are ALWAYS deliverable:
  // short-circuit BEFORE the suppression-list lookups so a seed address is
  // exempt even if it somehow appears on a list. Flag-gated: when
  // INTERNAL_SEED_ALLOWLIST_ENABLED is off, `isInternalSeedAddress` returns
  // false without any query, so this is a no-op and behaviour is unchanged.
  if (await isInternalSeedAddress(normalizedEmail)) {
    return {
      suppressed: false,
      reason: "none",
      normalizedEmail,
      normalizedDomain,
      internalSeedExempt: true,
    };
  }

  const [emailHit, domainHits, familyHits] = await Promise.all([
    prisma.suppressedEmail.findUnique({
      where: {
        clientId_email: { clientId, email: normalizedEmail },
      },
    }),
    // A suppressed domain covers its subdomains: match the recipient's domain
    // OR any of its parents, so suppressing `bt.com` also stops a send to
    // `someone@newsletter.bt.com`. `suppressionDomainCandidates` splits on
    // label boundaries, so `notbt.com` and `bt.com.evil.net` do NOT match.
    domainCandidates.length > 0
      ? prisma.suppressedDomain.findMany({
          where: { clientId, domain: { in: domainCandidates } },
        })
      : Promise.resolve([]),
    // RULING 3 — is the recipient's domain (or any parent of it) a listed member
    // of a related-company family for THIS client? Fetched alongside the others
    // rather than after them, so the common case costs no extra round trip.
    domainCandidates.length > 0
      ? prisma.suppressedDomainFamily.findMany({
          where: { clientId, domain: { in: domainCandidates } },
        })
      : Promise.resolve([]),
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

  if (domainHits.length > 0) {
    // Report the most specific matching row, so the audit trail names the entry
    // a human would point at when asked why this send was blocked.
    const matched = domainCandidates.find((candidate) =>
      domainHits.some((row) => row.domain === candidate),
    );
    return {
      suppressed: true,
      reason: "domain_list",
      normalizedEmail,
      normalizedDomain,
      matchedDomain: matched ?? domainHits[0].domain,
    };
  }

  // RULING 3 (Greg, 2026-08-24) — a suppressed domain may also cover RELATED
  // COMPANY domains, but only ones a human has explicitly listed for this
  // client. Suppression is TRANSITIVE across a family: if any member is
  // suppressed, every member is.
  //
  // Runs on the SEND path, not only at import, so a family entry added today
  // protects a contact loaded last month — which is the case that will actually
  // happen, since clients hand over updated do-not-contact sheets weekly.
  //
  // Deliberately NOT inferred. Membership is a listed fact: `bteurope.com`
  // shares no text with `bt.com`, and an algorithm that connected them would
  // also connect things that are not related.
  if (familyHits.length > 0) {
    const labels = [...new Set(familyHits.map((f) => f.label))];
    const members = await prisma.suppressedDomainFamily.findMany({
      where: { clientId, label: { in: labels } },
    });
    const memberDomains = [...new Set(members.map((m) => m.domain))];
    const suppressedMembers =
      memberDomains.length > 0
        ? await prisma.suppressedDomain.findMany({
            where: { clientId, domain: { in: memberDomains } },
          })
        : [];

    if (suppressedMembers.length > 0) {
      // Report the most specific candidate that put the recipient in a family,
      // and the label, so "why was this blocked?" has a human answer.
      const matched =
        domainCandidates.find((c) => familyHits.some((f) => f.domain === c)) ??
        familyHits[0].domain;
      const label =
        familyHits.find((f) => f.domain === matched)?.label ?? familyHits[0].label;
      return {
        suppressed: true,
        reason: "domain_family",
        normalizedEmail,
        normalizedDomain,
        matchedDomain: matched,
        matchedFamilyLabel: label,
      };
    }
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
