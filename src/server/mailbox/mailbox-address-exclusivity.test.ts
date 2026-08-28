import { beforeEach, describe, expect, it, vi } from "vitest";

// `npm test` must stay off a database (AGENTS.md). The same two queries are
// executed for real against PostgreSQL in
// `mailbox-address-exclusivity.integration.test.ts` — that is where "is this
// valid SQL" is answered; here it is only the ownership rule.
const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { clientMailboxIdentity: { findMany: (...a: unknown[]) => findManyMock(...a) } },
}));

import {
  findSharedMailboxAddresses,
  mailboxAddressConflictMessage,
  mayPersistRawInboundMail,
  resolveRawStoreOwner,
  type LiveMailboxRow,
} from "./mailbox-address-exclusivity";

function row(
  id: string,
  clientId: string,
  since: string,
  emailNormalized = "shared@acme.example",
): LiveMailboxRow {
  return { id, clientId, emailNormalized, since: new Date(since) };
}

describe("resolveRawStoreOwner", () => {
  it("gives the address to the workspace that had it first", () => {
    const owner = resolveRawStoreOwner([
      row("mb-b", "client-b", "2026-06-30T00:00:00Z"),
      row("mb-a", "client-a", "2026-01-05T00:00:00Z"),
    ]);

    expect(owner?.id).toBe("mb-a");
  });

  it("does not depend on the order rows come back from the database", () => {
    const a = row("mb-a", "client-a", "2026-01-05T00:00:00Z");
    const b = row("mb-b", "client-b", "2026-06-30T00:00:00Z");

    expect(resolveRawStoreOwner([a, b])?.id).toBe(resolveRawStoreOwner([b, a])?.id);
  });

  it("breaks an exact timestamp tie the same way every time", () => {
    // Without this, two rows created in the same transaction could swap
    // ownership between syncs — and both workspaces would end up holding a
    // partial copy of the inbox while every individual sync looked correct.
    const a = row("mb-aaa", "client-a", "2026-01-05T00:00:00Z");
    const b = row("mb-bbb", "client-b", "2026-01-05T00:00:00Z");

    expect(resolveRawStoreOwner([a, b])?.id).toBe("mb-aaa");
    expect(resolveRawStoreOwner([b, a])?.id).toBe("mb-aaa");
  });

  it("returns null for no rows rather than throwing", () => {
    expect(resolveRawStoreOwner([])).toBeNull();
  });
});

describe("findSharedMailboxAddresses", () => {
  it("reports an address held by two workspaces", () => {
    const shared = findSharedMailboxAddresses([
      row("mb-a", "client-a", "2026-01-05T00:00:00Z"),
      row("mb-b", "client-b", "2026-06-30T00:00:00Z"),
    ]);

    expect(shared).toHaveLength(1);
    expect(shared[0]?.ownerClientId).toBe("client-a");
  });

  it("ignores two rows for the same address on the SAME workspace", () => {
    // Impossible today via @@unique([clientId, emailNormalized]), but the rule
    // being asserted is "two workspaces", not "two rows".
    const shared = findSharedMailboxAddresses([
      row("mb-1", "client-a", "2026-01-05T00:00:00Z"),
      row("mb-2", "client-a", "2026-06-30T00:00:00Z"),
    ]);

    expect(shared).toEqual([]);
  });

  it("does not confuse two different addresses on two workspaces", () => {
    const shared = findSharedMailboxAddresses([
      row("mb-a", "client-a", "2026-01-05T00:00:00Z", "lucy@acme.example"),
      row("mb-b", "client-b", "2026-06-30T00:00:00Z", "sam@northwind.example"),
    ]);

    expect(shared).toEqual([]);
  });
});

describe("mayPersistRawInboundMail", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  function dbReturning(rows: Array<Record<string, unknown>>) {
    findManyMock.mockResolvedValue(rows);
  }

  const OWNER_ROW = {
    id: "mb-a",
    clientId: "client-a",
    emailNormalized: "shared@acme.example",
    connectedAt: new Date("2026-01-05T00:00:00Z"),
    createdAt: new Date("2026-01-04T00:00:00Z"),
  };
  const SECOND_ROW = {
    id: "mb-b",
    clientId: "client-b",
    emailNormalized: "shared@acme.example",
    connectedAt: new Date("2026-06-30T00:00:00Z"),
    createdAt: new Date("2026-06-29T00:00:00Z"),
  };

  it("allows the only workspace holding an address", async () => {
    dbReturning([OWNER_ROW]);

    const decision = await mayPersistRawInboundMail({
      mailboxIdentityId: "mb-a",
      emailNormalized: "shared@acme.example",
    });

    expect(decision.allowed).toBe(true);
  });

  it("allows the owner when the address is shared", async () => {
    dbReturning([OWNER_ROW, SECOND_ROW]);

    const decision = await mayPersistRawInboundMail({
      mailboxIdentityId: "mb-a",
      emailNormalized: "shared@acme.example",
    });

    expect(decision.allowed).toBe(true);
  });

  it("refuses the second workspace, and says which one owns it", async () => {
    dbReturning([OWNER_ROW, SECOND_ROW]);

    const decision = await mayPersistRawInboundMail({
      mailboxIdentityId: "mb-b",
      emailNormalized: "shared@acme.example",
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected a refusal");
    expect(decision.ownerClientId).toBe("client-a");
    expect(decision.sharedWithClientIds).toEqual(["client-a", "client-b"]);
  });

  it("falls back to createdAt when a mailbox was never connected", async () => {
    // A DRAFT row has no connectedAt. It must still sort, or the comparison
    // silently treats every draft as equally old.
    dbReturning([{ ...OWNER_ROW, id: "mb-draft", connectedAt: null }, SECOND_ROW]);

    const decision = await mayPersistRawInboundMail({
      mailboxIdentityId: "mb-b",
      emailNormalized: "shared@acme.example",
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected a refusal");
    expect(decision.ownerClientId).toBe("client-a");
  });
});

describe("mailboxAddressConflictMessage", () => {
  it("names the workspace and gives the way out", () => {
    const message = mailboxAddressConflictMessage("lucy@acme.example", [
      { mailboxId: "mb-x", clientId: "client-x", clientName: "Northwind Fabrication" },
    ]);

    expect(message).toContain("lucy@acme.example");
    expect(message).toContain("Northwind Fabrication");
    expect(message).toContain("Remove it from the other workspace first");
  });

  it("lists every workspace when there is more than one", () => {
    const message = mailboxAddressConflictMessage("lucy@acme.example", [
      { mailboxId: "mb-x", clientId: "client-x", clientName: "Northwind" },
      { mailboxId: "mb-y", clientId: "client-y", clientName: "Calder Group" },
    ]);

    expect(message).toContain("Northwind, Calder Group");
  });
});
