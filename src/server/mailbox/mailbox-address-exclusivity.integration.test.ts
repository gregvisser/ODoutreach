/**
 * E-06, proven against a real PostgreSQL — not against a mock.
 *
 * The unit tests beside this file inject their own `db`, which is the right
 * way to pin the ownership rule but says nothing about whether the query the
 * shipped code sends is valid SQL. `client: { deletedAt: null }` is a relation
 * filter and `clientId: { not: ... }` is a negation; both pass any mock and
 * either could throw in production. This repository's most repeated defect is
 * something built, wired, reporting success and never actually firing, so the
 * two gate queries get executed against a real database before this is called
 * done.
 *
 * Run it:
 *   docker run -d --name odoutreach-e2e-postgres \
 *     -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
 *     -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine
 *   npm run db:migrate:e2e
 *   npm run test:integration -- mailbox-address-exclusivity
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  findMailboxAddressConflicts,
  mayPersistRawInboundMail,
} from "@/server/mailbox/mailbox-address-exclusivity";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";

const SHARED = "lucy@acme-industrial.example";

const FIRST_CONNECTED = new Date("2026-01-05T09:00:00.000Z");
const LATER_CONNECTED = new Date("2026-06-30T09:00:00.000Z");

beforeEach(async () => {
  await resetIntegrationDatabase();
});

afterAll(async () => {
  await closeIntegrationPool();
  await prisma.$disconnect();
});

async function seedClient(name: string, slug: string, deleted = false) {
  return prisma.client.create({
    data: { name, slug, ...(deleted ? { deletedAt: new Date() } : {}) },
  });
}

async function seedMailbox(input: {
  clientId: string;
  connectedAt: Date | null;
  removed?: boolean;
}) {
  return prisma.clientMailboxIdentity.create({
    data: {
      clientId: input.clientId,
      provider: "MICROSOFT",
      email: SHARED,
      emailNormalized: SHARED,
      connectionStatus: input.connectedAt ? "CONNECTED" : "DRAFT",
      connectedAt: input.connectedAt,
      ...(input.removed ? { workspaceRemovedAt: new Date("2026-07-01T00:00:00.000Z") } : {}),
    },
  });
}

describe("the create-time refusal, executed as real SQL", () => {
  it("finds the same address on another workspace", async () => {
    const northwind = await seedClient("Northwind Fabrication", "northwind");
    const calder = await seedClient("Calder Group", "calder");
    await seedMailbox({ clientId: northwind.id, connectedAt: FIRST_CONNECTED });

    const conflicts = await findMailboxAddressConflicts({
      emailNormalized: SHARED,
      clientId: calder.id,
    });

    expect(conflicts).toHaveLength(1);
    // The refusal message reads this. If the relation select ever breaks, the
    // staff member gets "undefined" instead of a workspace name.
    expect(conflicts[0]?.clientName).toBe("Northwind Fabrication");
  });

  it("does not count a mailbox that was removed from its workspace", async () => {
    const northwind = await seedClient("Northwind Fabrication", "northwind");
    const calder = await seedClient("Calder Group", "calder");
    await seedMailbox({ clientId: northwind.id, connectedAt: FIRST_CONNECTED, removed: true });

    const conflicts = await findMailboxAddressConflicts({
      emailNormalized: SHARED,
      clientId: calder.id,
    });

    // A removed mailbox does not sync, so it must not block a genuine re-add.
    expect(conflicts).toEqual([]);
  });

  it("does not count a mailbox on a soft-deleted workspace", async () => {
    const gone = await seedClient("Closed Account", "closed-account", true);
    const calder = await seedClient("Calder Group", "calder");
    await seedMailbox({ clientId: gone.id, connectedAt: FIRST_CONNECTED });

    const conflicts = await findMailboxAddressConflicts({
      emailNormalized: SHARED,
      clientId: calder.id,
    });

    expect(conflicts).toEqual([]);
  });

  it("never reports the workspace asking about its own mailbox", async () => {
    const northwind = await seedClient("Northwind Fabrication", "northwind");
    await seedMailbox({ clientId: northwind.id, connectedAt: FIRST_CONNECTED });

    const conflicts = await findMailboxAddressConflicts({
      emailNormalized: SHARED,
      clientId: northwind.id,
    });

    expect(conflicts).toEqual([]);
  });
});

describe("the raw-store gate, executed as real SQL", () => {
  it("gives the raw store to the workspace that connected first, and only that one", async () => {
    const northwind = await seedClient("Northwind Fabrication", "northwind");
    const calder = await seedClient("Calder Group", "calder");
    const first = await seedMailbox({ clientId: northwind.id, connectedAt: FIRST_CONNECTED });
    const second = await seedMailbox({ clientId: calder.id, connectedAt: LATER_CONNECTED });

    const owner = await mayPersistRawInboundMail({
      mailboxIdentityId: first.id,
      emailNormalized: SHARED,
    });
    const other = await mayPersistRawInboundMail({
      mailboxIdentityId: second.id,
      emailNormalized: SHARED,
    });

    expect(owner.allowed).toBe(true);
    expect(other.allowed).toBe(false);
    if (other.allowed) throw new Error("expected the second workspace to be refused");
    expect(other.ownerClientId).toBe(northwind.id);
  });

  it("leaves a mailbox that belongs to one workspace completely alone", async () => {
    const northwind = await seedClient("Northwind Fabrication", "northwind");
    const only = await seedMailbox({ clientId: northwind.id, connectedAt: FIRST_CONNECTED });

    const decision = await mayPersistRawInboundMail({
      mailboxIdentityId: only.id,
      emailNormalized: SHARED,
    });

    expect(decision.allowed).toBe(true);
  });

  it("hands the address back once the other workspace releases it", async () => {
    const northwind = await seedClient("Northwind Fabrication", "northwind");
    const calder = await seedClient("Calder Group", "calder");
    const first = await seedMailbox({ clientId: northwind.id, connectedAt: FIRST_CONNECTED });
    const second = await seedMailbox({ clientId: calder.id, connectedAt: LATER_CONNECTED });

    expect((await mayPersistRawInboundMail({
      mailboxIdentityId: second.id,
      emailNormalized: SHARED,
    })).allowed).toBe(false);

    // The operator fixes the mis-connection by removing it from the first.
    await prisma.clientMailboxIdentity.update({
      where: { id: first.id },
      data: { workspaceRemovedAt: new Date() },
    });

    // The remaining workspace resumes storing its own mail — the containment
    // is not a one-way latch that has to be cleared by hand.
    expect((await mayPersistRawInboundMail({
      mailboxIdentityId: second.id,
      emailNormalized: SHARED,
    })).allowed).toBe(true);
  });
});
