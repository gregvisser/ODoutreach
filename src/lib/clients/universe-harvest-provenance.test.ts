import { describe, expect, it } from "vitest";
import { classifyUniverseHarvestCandidate, clientMayReuseUniversePerson } from "./universe-harvest-provenance";

const base = {
  clientId: "client-a",
  firstSeenClientId: "client-a" as string | null,
  sourceClientIds: ["client-a"],
  hasEmail: true,
  matchesPlan: true,
  existingContactId: null as string | null,
  onList: false,
  enrolled: false,
  suppressed: false,
  inCooldown: false,
};

describe("Universe re-harvest provenance", () => {
  it("allows a person this client already sourced", () => {
    expect(clientMayReuseUniversePerson({ clientId: "client-a", firstSeenClientId: "client-a", sourceClientIds: [] }).allowed).toBe(true);
    expect(clientMayReuseUniversePerson({ clientId: "client-a", firstSeenClientId: "client-b", sourceClientIds: ["client-a"] }).allowed).toBe(true);
  });

  it("refuses a person sourced only for another client", () => {
    const decision = clientMayReuseUniversePerson({
      clientId: "client-a",
      firstSeenClientId: "client-b",
      sourceClientIds: ["client-b"],
    });
    expect(decision.allowed).toBe(false);
  });

  it("attaches this client's existing contact when they are not already on the list", () => {
    expect(classifyUniverseHarvestCandidate({ ...base, existingContactId: "contact-1" })).toEqual({
      action: "attach",
      contactId: "contact-1",
    });
  });

  it("creates a contact from this client's Universe row when they are not already on the client", () => {
    expect(classifyUniverseHarvestCandidate(base)).toEqual({ action: "create" });
  });

  it("does not copy another client's Universe row onto this list", () => {
    expect(
      classifyUniverseHarvestCandidate({
        ...base,
        firstSeenClientId: "client-b",
        sourceClientIds: ["client-b"],
      }),
    ).toEqual({ action: "skip", reason: "provenance" });
  });

  it("skips do-not-contact, cooldown, the current list, and enrolled people", () => {
    expect(classifyUniverseHarvestCandidate({ ...base, suppressed: true })).toEqual({ action: "skip", reason: "suppressed" });
    expect(classifyUniverseHarvestCandidate({ ...base, inCooldown: true })).toEqual({ action: "skip", reason: "cooldown" });
    expect(classifyUniverseHarvestCandidate({ ...base, onList: true })).toEqual({ action: "skip", reason: "on-list" });
    expect(classifyUniverseHarvestCandidate({ ...base, enrolled: true })).toEqual({ action: "skip", reason: "enrolled" });
    expect(classifyUniverseHarvestCandidate({ ...base, matchesPlan: false })).toEqual({ action: "skip", reason: "no-match" });
  });
});
