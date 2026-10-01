import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  where: null as unknown,
  rows: [] as unknown[],
  contacts: [] as { id: string; email: string | null }[],
  sends: [] as { toEmail: string; sentAt: Date }[],
  created: [] as { originNote?: string | null }[],
  suppressed: false,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    contactUniverse: {
      findMany: async ({ where }: { where: unknown }) => {
        db.where = where;
        return db.rows;
      },
      findUnique: async () => db.rows[0] ?? null,
    },
    contact: {
      findMany: async () => db.contacts,
      findUnique: async () => null,
      create: async ({ data }: { data: { originNote?: string | null } }) => {
        db.created.push(data);
        return { id: "created-contact" };
      },
    },
    contactListMember: { findMany: async () => [] },
    clientEmailSequenceEnrollment: { findMany: async () => [] },
    outboundEmail: { findMany: async () => db.sends },
    contactUniverseSource: { create: async () => ({ id: "source" }) },
    client: { findUnique: async () => ({ organisationId: "org_opensdoors" }) },
  },
}));
vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: async () => ({ suppressed: db.suppressed, reason: db.suppressed ? "email_list" : "none" }),
}));
vi.mock("@/server/contacts/contact-lists", () => ({
  attachContactsToClientList: async () => ({ added: db.created.length, skipped: 0 }),
}));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: async () => undefined }));

import { applyUniverseHarvest } from "./universe-harvest";

const criteria = {
  titles: ["Head of Procurement"],
  industries: ["Construction"],
  seniorities: ["Director"],
  regions: ["United Kingdom"],
};

const row = {
  id: "uni-1",
  emailNormalized: "ada@example.test",
  fullName: "Ada",
  firstName: "Ada",
  lastName: null,
  jobTitle: "Director, Head of Procurement",
  companyName: "Example Construction",
  industry: null,
  location: "Manchester, United Kingdom",
  city: null,
  country: null,
  firstSeenClientId: "client-1",
  sources: [{ clientId: "client-1" }],
};

beforeEach(() => {
  db.where = null;
  db.rows = [row];
  db.contacts = [];
  db.sends = [];
  db.created = [];
  db.suppressed = false;
});

it("reads only Universe rows this client sourced, then labels a new contact as re-harvested", async () => {
  const result = await applyUniverseHarvest({
    clientId: "client-1",
    sequenceId: "seq-1",
    contactListId: "list-1",
    criteria,
    now: new Date("2026-09-29T12:00:00.000Z"),
    maxToAdd: 5,
    staffId: null,
  });
  expect(db.where).toMatchObject({
    OR: [{ firstSeenClientId: "client-1" }, { sources: { some: { clientId: "client-1" } } }],
  });
  expect(result).toMatchObject({ ok: true, created: 1 });
  expect(db.created[0]?.originNote).toBe("Re-harvested from Universe on 29 Sep 2026");
});

it("does not add a person who is do-not-contact or inside the cooldown", async () => {
  db.suppressed = true;
  const blocked = await applyUniverseHarvest({
    clientId: "client-1",
    sequenceId: "seq-1",
    contactListId: "list-1",
    criteria,
    now: new Date("2026-09-29T12:00:00.000Z"),
    maxToAdd: 5,
    staffId: null,
  });
  expect(blocked).toMatchObject({ ok: true, created: 0, added: 0 });

  db.suppressed = false;
  db.sends = [{ toEmail: "ada@example.test", sentAt: new Date("2026-09-25T12:00:00.000Z") }];
  const cooling = await applyUniverseHarvest({
    clientId: "client-1",
    sequenceId: "seq-1",
    contactListId: "list-1",
    criteria,
    now: new Date("2026-09-29T12:00:00.000Z"),
    maxToAdd: 5,
    staffId: null,
  });
  expect(cooling).toMatchObject({ ok: true, created: 0 });
  expect(db.created).toHaveLength(0);
});

it("does not copy a Universe row sourced only for another client", async () => {
  db.rows = [{ ...row, firstSeenClientId: "client-b", sources: [{ clientId: "client-b" }] }];
  const result = await applyUniverseHarvest({
    clientId: "client-1",
    sequenceId: "seq-1",
    contactListId: "list-1",
    criteria,
    now: new Date("2026-09-29T12:00:00.000Z"),
    maxToAdd: 5,
    staffId: "staff-1",
  });
  expect(result).toMatchObject({ ok: true, created: 0, added: 0 });
  expect(db.created).toHaveLength(0);
});

it("does not enrol contacts or send email", () => {
  const source = readFileSync(path.join(process.cwd(), "src/server/prospect-research/universe-harvest.ts"), "utf8");
  expect(source).not.toMatch(/enrollSequenceContacts|processOutboundSendQueue|sendSequenceStep|advanceDueSequenceFollowUps/);
});
