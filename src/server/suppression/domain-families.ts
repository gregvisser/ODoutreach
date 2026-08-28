import "server-only";

import { prisma } from "@/lib/db";
import {
  isStorableSuppressionDomain,
  isValidDomainFormat,
  normalizeDomain,
} from "@/lib/normalize";

/**
 * RULING 3 (Greg, 2026-08-24) — related-company domain families.
 *
 * A client says "do not contact BT" and hands over `bt.com`. Someone at
 * `bteurope.com` is on the prospect list. They must not be emailed.
 *
 * Membership is a LISTED FACT, never an inference. `bteurope.com` shares no
 * text with `bt.com`; any algorithm connecting them would also connect things
 * that are not related, and over-blocking a client's real prospects is its own
 * failure. So a human types "BT" and lists the domains that belong to it.
 *
 * A family is the set of rows sharing a `label` within one client. Suppression
 * is transitive across it: if ANY member is suppressed for that client, EVERY
 * member is. The gate itself lives in `evaluateSuppression`.
 */

export type FamilyMember = {
  id: string;
  label: string;
  domain: string;
  /** Whether THIS domain is itself on the client's do-not-contact list. */
  isSuppressed: boolean;
  /**
   * True when the system added this itself, with nobody asked.
   *
   * A block nobody can see is a block nobody can undo, and this is the only
   * row in the table that no human ever agreed to. It is derived rather than
   * stored: a row carries `discoveredSource` only if it came from a proposal,
   * and carries no `createdByStaffUserId` only if no person confirmed it. A
   * hand-typed row has neither; a person confirming a proposal has both.
   */
  addedAutomatically: boolean;
  createdAt: Date;
};

export type DomainFamily = {
  label: string;
  members: FamilyMember[];
  /**
   * True when at least one member is suppressed — i.e. the family is ACTIVE and
   * currently blocking sends. A family with no suppressed member is listed but
   * blocks nothing, and the UI must say so rather than implying protection.
   */
  isBlocking: boolean;
};

/** Normalise and validate a domain for family membership. */
export function normalizeFamilyDomain(
  raw: string,
): { ok: true; domain: string } | { ok: false; error: string } {
  const domain = normalizeDomain(raw ?? "");
  if (!domain) return { ok: false, error: "Enter a domain." };
  if (domain.includes("@")) {
    return {
      ok: false,
      error: "That looks like an email address. Enter just the domain, e.g. bteurope.com",
    };
  }
  if (!isValidDomainFormat(domain)) {
    return { ok: false, error: `"${raw}" is not a valid domain.` };
  }
  // Suppression is transitive across a family, so a public suffix listed as a
  // member would blackhole an entire TLD for this client the moment any member
  // is suppressed.
  if (!isStorableSuppressionDomain(domain)) {
    return {
      ok: false,
      error: `"${domain}" is a domain ending, not a company domain. Enter the company's own domain, e.g. example.${domain.replace(/^\./, "")}`,
    };
  }
  return { ok: true, domain };
}

/** Trim and collapse a family label. Grouping only — never matched against email. */
export function normalizeFamilyLabel(
  raw: string,
): { ok: true; label: string } | { ok: false; error: string } {
  const label = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!label) return { ok: false, error: "Enter a company name, e.g. BT." };
  if (label.length > 80) {
    return { ok: false, error: "Company name is too long (80 characters max)." };
  }
  return { ok: true, label };
}

/**
 * Every family for a client, with each member marked according to whether it is
 * itself suppressed — which is what decides whether the family blocks anything.
 */
export async function listDomainFamiliesForClient(
  clientId: string,
): Promise<DomainFamily[]> {
  const rows = await prisma.suppressedDomainFamily.findMany({
    where: { clientId },
    orderBy: [{ label: "asc" }, { domain: "asc" }],
  });
  if (rows.length === 0) return [];

  const suppressed = await prisma.suppressedDomain.findMany({
    where: { clientId, domain: { in: [...new Set(rows.map((r) => r.domain))] } },
    select: { domain: true },
  });
  const suppressedSet = new Set(suppressed.map((s) => s.domain));

  const byLabel = new Map<string, FamilyMember[]>();
  for (const r of rows) {
    const member: FamilyMember = {
      id: r.id,
      label: r.label,
      domain: r.domain,
      isSuppressed: suppressedSet.has(r.domain),
      addedAutomatically: r.discoveredSource !== null && r.createdByStaffUserId === null,
      createdAt: r.createdAt,
    };
    const list = byLabel.get(r.label);
    if (list) list.push(member);
    else byLabel.set(r.label, [member]);
  }

  return [...byLabel.entries()].map(([label, members]) => ({
    label,
    members,
    isBlocking: members.some((m) => m.isSuppressed),
  }));
}
