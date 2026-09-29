/**
 * Who may be copied from Universe onto a client's list.
 *
 * The privacy policy says personal data is not shared between customer
 * organisations for outreach. The cross-customer Universe store is kept for
 * de-duplication, and the Universe plan defers attaching one client's list to
 * another until there is an explicit OpensDoors confirmation step. That step
 * does not exist, so a person sourced only for another client is not copied.
 *
 * A person this client already sourced may be placed on this client's list.
 */
export function clientMayReuseUniversePerson(input: {
  clientId: string;
  firstSeenClientId: string | null;
  sourceClientIds: string[];
}): { allowed: true } | { allowed: false; reason: string } {
  const sourcedHere =
    input.firstSeenClientId === input.clientId || input.sourceClientIds.includes(input.clientId);
  if (sourcedHere) return { allowed: true };
  return {
    allowed: false,
    reason: "Sourced for another client. Universe keeps that record for de-duplication and it is not copied onto this list.",
  };
}

export type UniverseHarvestSkip =
  | "no-email"
  | "no-match"
  | "provenance"
  | "on-list"
  | "enrolled"
  | "suppressed"
  | "cooldown";

export type UniverseHarvestDecision =
  | { action: "attach"; contactId: string }
  | { action: "create" }
  | { action: "skip"; reason: UniverseHarvestSkip };

export function classifyUniverseHarvestCandidate(input: {
  clientId: string;
  firstSeenClientId: string | null;
  sourceClientIds: string[];
  hasEmail: boolean;
  matchesPlan: boolean;
  existingContactId: string | null;
  onList: boolean;
  enrolled: boolean;
  suppressed: boolean;
  inCooldown: boolean;
}): UniverseHarvestDecision {
  if (!input.hasEmail) return { action: "skip", reason: "no-email" };
  if (!input.matchesPlan) return { action: "skip", reason: "no-match" };
  const reuse = clientMayReuseUniversePerson(input);
  if (!reuse.allowed && !input.existingContactId) return { action: "skip", reason: "provenance" };
  if (input.onList) return { action: "skip", reason: "on-list" };
  if (input.enrolled) return { action: "skip", reason: "enrolled" };
  if (input.suppressed) return { action: "skip", reason: "suppressed" };
  if (input.inCooldown) return { action: "skip", reason: "cooldown" };
  if (input.existingContactId) return { action: "attach", contactId: input.existingContactId };
  if (!reuse.allowed) return { action: "skip", reason: "provenance" };
  return { action: "create" };
}
