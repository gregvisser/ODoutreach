import { parse } from "tldts";

/**
 * What an operator reads when the machine thinks two domains are one company.
 *
 * Plain English, per the standard that already applies to this product: no
 * source codes, no RFC names, no "registrable domain", no severity letters. The
 * person deciding is not an engineer, and the decision is theirs — the machine
 * only proposes.
 *
 * The fan-in line is not decoration. The cap refuses a seed that three or more
 * companies point at, but the cap is NOT the safety mechanism — the operator's
 * click is. `nhs.net` had fan-in 2 in the real data and is still a shared
 * service, so "4 other companies also point here" is exactly the sentence that
 * makes a person say no.
 */

export type FamilyProposalCopyInput = {
  /** The domain we think belongs with the suppressed one. */
  proposedDomain: string;
  /** The suppressed domain — already on the client's do-not-contact list. */
  seedDomain: string;
  source: "DMARC_RUA" | "SPF_REDIRECT";
  /** How many other contact domains also point at the seed. */
  fanIn: number;
  /** How many contacts confirming this would suppress. */
  contactsAffected: number;
};

export type FamilyProposalCopy = {
  /** e.g. "Openreach may belong to BT." */
  headline: string;
  /** Why we think so, in one sentence, naming the domains. */
  because: string;
  /** The fan-in signal, phrased for a person. */
  alsoPointHere: string;
  /** What confirming will do, stated before it is clicked. */
  ifYouConfirm: string;
  /** That rejecting is final. */
  ifYouReject: string;
  confirmLabel: string;
  rejectLabel: string;
};

/**
 * A readable company name from a domain: `openreach.co.uk` -> "Openreach".
 *
 * Short labels are upper-cased because "Bt" reads as a typo where "BT" reads as
 * a company. This is display only — it is never matched against anything.
 */
export function companyNameFromDomain(domain: string): string {
  const reg = parse(domain.trim().toLowerCase(), { allowPrivateDomains: true });
  const label = (reg.domainWithoutSuffix ?? reg.domain ?? domain)
    .split(".")[0]
    ?.replace(/[-_]+/g, " ")
    .trim();
  if (!label) return domain;
  if (label.length <= 3) return label.toUpperCase();
  return label
    .split(" ")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

function pluraliseContacts(n: number): string {
  return n === 1 ? "1 contact" : `${n} contacts`;
}

export function buildFamilyProposalCopy(
  input: FamilyProposalCopyInput,
): FamilyProposalCopy {
  const proposedName = companyNameFromDomain(input.proposedDomain);
  const seedName = companyNameFromDomain(input.seedDomain);

  // Both sources are the company publishing something about its own mail. The
  // wording says what was found, not which RFC it came from.
  const because =
    input.source === "DMARC_RUA"
      ? `${input.proposedDomain} sends its email security reports to ${input.seedDomain}, and you have asked us not to contact ${input.seedDomain}.`
      : `${input.proposedDomain} hands its email settings over to ${input.seedDomain}, and you have asked us not to contact ${input.seedDomain}.`;

  const others = Math.max(0, input.fanIn - 1);
  const alsoPointHere =
    others === 0
      ? `No other company on your list points to ${input.seedDomain}.`
      : others === 1
        ? `1 other company on your list also points to ${input.seedDomain}, so check this is not a shared supplier.`
        : `${others} other companies on your list also point to ${input.seedDomain}, so check this is not a shared supplier.`;

  return {
    headline: `${proposedName} may belong to ${seedName}.`,
    because,
    alsoPointHere,
    ifYouConfirm:
      input.contactsAffected === 0
        ? `Saying yes will stop us contacting anyone at ${input.proposedDomain}. Nobody on your current lists is affected today.`
        : `Saying yes will stop us contacting ${pluraliseContacts(input.contactsAffected)} at ${input.proposedDomain}.`,
    ifYouReject: `Saying no is final — we will not ask about ${input.proposedDomain} again.`,
    confirmLabel: "Yes, same company",
    rejectLabel: "No, different company",
  };
}
