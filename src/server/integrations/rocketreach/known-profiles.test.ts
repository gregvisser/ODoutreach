import { expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  enrichmentWhere: null as unknown,
  contactWhere: null as unknown,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    rocketReachEnrichment: {
      findMany: async ({ where }: { where: unknown }) => {
        queries.enrichmentWhere = where;
        return [{ externalId: "4", contactId: "contact-4" }];
      },
    },
    contactUniverseSource: {
      findMany: async () => [{
        rocketReachPersonId: "9",
        universe: {
          id: "uni-9",
          emailNormalized: null,
          linkedinUrlNormalized: "https://www.linkedin.com/in/known",
          firstName: null,
          lastName: null,
          fullName: "Known",
          companyName: null,
          jobTitle: null,
          location: null,
          city: null,
          country: null,
          industry: null,
        },
      }],
    },
    contactUniverse: { findMany: async () => [] },
    contact: {
      findMany: async ({ where }: { where: unknown }) => {
        queries.contactWhere = where;
        return [{ id: "contact-9", email: null, linkedIn: null, universeContactId: "uni-9" }];
      },
    },
  },
}));

import { loadKnownRocketReachIndexes } from "./known-profiles";

it("indexes this client's contacts and does not query another client's rows", async () => {
  const indexes = await loadKnownRocketReachIndexes("client-1", [{
    id: 9,
    name: "Known",
    title: null,
    employer: null,
    location: null,
    linkedinUrl: "https://www.linkedin.com/in/known",
    linkedinNormalized: "https://www.linkedin.com/in/known",
    emails: ["known@example.test"],
  }]);
  expect(queries.enrichmentWhere).toMatchObject({ clientId: "client-1" });
  expect(queries.contactWhere).toMatchObject({ clientId: "client-1" });
  expect(indexes.clientContactIdByProfileId.get("4")).toBe("contact-4");
  expect(indexes.clientContactIdByProfileId.get("9")).toBe("contact-9");
  expect(indexes.universeByProfileId.get("9")?.universeId).toBe("uni-9");
});
