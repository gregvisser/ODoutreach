import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type ClientRow = {
  id: string;
  name: string;
  deletedAt: Date | null;
  deletedByStaffUserId: string | null;
};

type AuditRow = {
  staffUserId: string | null;
  clientId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
};

const { clients, audit, tx } = vi.hoisted(() => {
  const clients: ClientRow[] = [];
  const audit: AuditRow[] = [];
  const tx = {
    client: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; deletedAt?: null | { not: null } };
          data: Partial<ClientRow>;
        }) => {
          const row = clients.find((c) => c.id === where.id);
          if (!row) return { count: 0 };
          // Honour the atomic guard the production code relies on.
          if (where.deletedAt === null && row.deletedAt !== null) return { count: 0 };
          if (
            where.deletedAt &&
            typeof where.deletedAt === "object" &&
            row.deletedAt === null
          ) {
            return { count: 0 };
          }
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: AuditRow }) => {
        audit.push(data);
        return data;
      }),
    },
  };
  return { clients, audit, tx };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    client: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          clients.find((c) => c.id === where.id) ?? null,
      ),
    },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
}));

import {
  restoreClientWorkspace,
  softDeleteClientWorkspace,
} from "./workspace-deletion";

const SUPER = { id: "greg", isSuperAdmin: true };
const NORMAL = { id: "op", isSuperAdmin: false };

function seed(rows: ClientRow[]) {
  clients.length = 0;
  audit.length = 0;
  for (const r of rows) clients.push({ ...r });
}

beforeEach(() => {
  vi.clearAllMocks();
  seed([]);
});

describe("softDeleteClientWorkspace", () => {
  it("refuses a non-super-admin and mutates nothing", async () => {
    seed([{ id: "c1", name: "Acme", deletedAt: null, deletedByStaffUserId: null }]);
    const res = await softDeleteClientWorkspace({
      actor: NORMAL,
      clientId: "c1",
      typedConfirmation: "Acme",
    });
    expect(res).toMatchObject({ ok: false, reason: "forbidden" });
    expect(clients[0].deletedAt).toBeNull();
    expect(audit).toHaveLength(0);
  });

  it("reports not_found for an unknown workspace", async () => {
    const res = await softDeleteClientWorkspace({
      actor: SUPER,
      clientId: "missing",
      typedConfirmation: "whatever",
    });
    expect(res).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("rejects a typed name that does not match exactly", async () => {
    seed([{ id: "c1", name: "Acme Ltd", deletedAt: null, deletedByStaffUserId: null }]);
    const res = await softDeleteClientWorkspace({
      actor: SUPER,
      clientId: "c1",
      typedConfirmation: "acme ltd",
    });
    expect(res).toMatchObject({ ok: false, reason: "name_mismatch" });
    expect(clients[0].deletedAt).toBeNull();
    expect(audit).toHaveLength(0);
  });

  it("soft-deletes on an exact match and writes an audit row", async () => {
    seed([{ id: "c1", name: "Acme Ltd", deletedAt: null, deletedByStaffUserId: null }]);
    const res = await softDeleteClientWorkspace({
      actor: SUPER,
      clientId: "c1",
      typedConfirmation: " Acme Ltd ",
    });
    expect(res).toMatchObject({ ok: true, clientName: "Acme Ltd" });
    expect(clients[0].deletedAt).toBeInstanceOf(Date);
    expect(clients[0].deletedByStaffUserId).toBe("greg");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "DELETE",
      entityType: "Client",
      entityId: "c1",
      metadata: { kind: "workspace_soft_delete", workspaceName: "Acme Ltd" },
    });
  });

  it("is idempotent-safe: a second delete reports already_deleted", async () => {
    seed([
      {
        id: "c1",
        name: "Acme Ltd",
        deletedAt: new Date("2026-06-01T00:00:00.000Z"),
        deletedByStaffUserId: "greg",
      },
    ]);
    const res = await softDeleteClientWorkspace({
      actor: SUPER,
      clientId: "c1",
      typedConfirmation: "Acme Ltd",
    });
    expect(res).toMatchObject({ ok: false, reason: "already_deleted" });
    expect(audit).toHaveLength(0);
  });
});

describe("restoreClientWorkspace", () => {
  it("refuses a non-super-admin", async () => {
    seed([
      {
        id: "c1",
        name: "Acme",
        deletedAt: new Date("2026-06-01T00:00:00.000Z"),
        deletedByStaffUserId: "greg",
      },
    ]);
    const res = await restoreClientWorkspace({ actor: NORMAL, clientId: "c1" });
    expect(res).toMatchObject({ ok: false, reason: "forbidden" });
    expect(clients[0].deletedAt).not.toBeNull();
  });

  it("reports not_deleted for a live workspace", async () => {
    seed([{ id: "c1", name: "Acme", deletedAt: null, deletedByStaffUserId: null }]);
    const res = await restoreClientWorkspace({ actor: SUPER, clientId: "c1" });
    expect(res).toMatchObject({ ok: false, reason: "not_deleted" });
  });

  it("restores a soft-deleted workspace and audits it", async () => {
    seed([
      {
        id: "c1",
        name: "Acme",
        deletedAt: new Date("2026-06-01T00:00:00.000Z"),
        deletedByStaffUserId: "greg",
      },
    ]);
    const res = await restoreClientWorkspace({ actor: SUPER, clientId: "c1" });
    expect(res).toMatchObject({ ok: true, clientName: "Acme" });
    expect(clients[0].deletedAt).toBeNull();
    expect(clients[0].deletedByStaffUserId).toBeNull();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "UPDATE",
      metadata: { kind: "workspace_restore" },
    });
  });
});
