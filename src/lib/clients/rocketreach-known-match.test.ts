import { describe, expect, it } from "vitest";
import {
  emptyKnownProfileIndexes,
  matchKnownSearchProfile,
  type RocketReachSearchIdentity,
  type UniverseReuseFields,
} from "./rocketreach-known-match";

const profile = (partial: Partial<RocketReachSearchIdentity>): RocketReachSearchIdentity => ({
  id: 42,
  name: "Ada Example",
  title: "Director",
  employer: "Example Ltd",
  location: "London",
  linkedinUrl: "https://www.linkedin.com/in/ada-example",
  linkedinNormalized: "linkedin.com/in/ada-example",
  emails: [],
  ...partial,
});

const universe = (partial: Partial<UniverseReuseFields> = {}): UniverseReuseFields => ({
  universeId: "uni-1",
  email: "ada@example.test",
  firstName: "Ada",
  lastName: "Example",
  fullName: "Ada Example",
  companyName: "Example Ltd",
  jobTitle: "Director",
  linkedinUrl: "linkedin.com/in/ada-example",
  location: "London",
  city: "London",
  country: "United Kingdom",
  industry: "Construction",
  ...partial,
});

describe("matchKnownSearchProfile", () => {
  it("matches a client contact on RocketReach id, LinkedIn, or email and skips a lookup", () => {
    const byId = emptyKnownProfileIndexes();
    byId.clientContactIdByProfileId.set("42", "contact-id");
    expect(matchKnownSearchProfile(profile({}), byId)).toEqual({ kind: "client", contactId: "contact-id" });

    const byLinkedIn = emptyKnownProfileIndexes();
    byLinkedIn.clientContactIdByLinkedIn.set("linkedin.com/in/ada-example", "contact-li");
    expect(matchKnownSearchProfile(profile({}), byLinkedIn)?.kind).toBe("client");

    const byEmail = emptyKnownProfileIndexes();
    byEmail.clientContactIdByEmail.set("ada@example.test", "contact-email");
    expect(
      matchKnownSearchProfile(profile({ emails: ["ada@example.test"], linkedinNormalized: null }), byEmail),
    ).toEqual({ kind: "client", contactId: "contact-email" });
  });

  it("reuses a Universe row with an email and does not treat an unknown profile as known", () => {
    const indexes = emptyKnownProfileIndexes();
    indexes.universeByProfileId.set("42", universe());
    expect(matchKnownSearchProfile(profile({}), indexes)).toMatchObject({
      kind: "universe",
      fields: { email: "ada@example.test" },
    });
    expect(matchKnownSearchProfile(profile({ id: 99 }), emptyKnownProfileIndexes())).toBeNull();
  });

  it("does not pay for a known profile that still has no email", () => {
    const indexes = emptyKnownProfileIndexes();
    indexes.universeByLinkedIn.set("linkedin.com/in/ada-example", universe({ email: "" }));
    expect(matchKnownSearchProfile(profile({}), indexes)).toEqual({ kind: "known-incomplete" });
  });
});
