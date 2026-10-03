import { describe, expect, it, vi } from "vitest";

import { runInOrganisation, runAsSystem } from "@/lib/tenant/organisation-context";
import { OrganisationScopeError } from "@/server/tenant/tenant-scope";

import { enforceTenantOperation, type TenantScopeResolution } from "./db-tenant-guard";

function baseWith(rows: { id: string; organisationId?: string }[]) {
  return {
    client: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; organisationId?: string; AND?: unknown[] } }) => {
        const id = where.id ?? readAndId(where);
        const organisationId = where.organisationId ?? readAndOrg(where);
        return (
          rows.find((row) => row.id === id && (organisationId === undefined || row.organisationId === organisationId)) ??
          null
        );
      }),
    },
    outboundEmail: {
      findFirst: vi.fn(async () => null),
    },
  };
}

function readAndId(where: { AND?: unknown[] }): string | undefined {
  const parts = where.AND;
  if (!parts) return undefined;
  for (const part of parts) {
    if (part && typeof part === "object" && "id" in part && typeof part.id === "string") return part.id;
  }
  return undefined;
}

function readAndOrg(where: { AND?: unknown[]; organisationId?: string }): string | undefined {
  if (where.organisationId) return where.organisationId;
  const parts = where.AND;
  if (!parts) return undefined;
  for (const part of parts) {
    if (part && typeof part === "object" && "organisationId" in part && typeof part.organisationId === "string") {
      return part.organisationId;
    }
    if (part && typeof part === "object" && "client" in part) {
      const client = (part as { client?: { organisationId?: string } }).client;
      if (client?.organisationId) return client.organisationId;
    }
  }
  return undefined;
}

const anonymous = async (): Promise<TenantScopeResolution> => ({ kind: "anonymous" });
const closed = async (): Promise<TenantScopeResolution> => ({
  kind: "organisation",
  organisationId: "org_scope_closed",
});

describe("enforceTenantOperation", () => {
  it("leaves a query alone when there is no staff session", async () => {
    const query = vi.fn(async () => ["all"]);
    const result = await enforceTenantOperation({
      base: {},
      model: "Client",
      operation: "findMany",
      args: { where: { deletedAt: null } },
      query,
      resolveScope: anonymous,
    });
    expect(result).toEqual(["all"]);
    expect(query).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });

  it("adds the organisation to a list query", async () => {
    const query = vi.fn(async (args) => args);
    const result = await enforceTenantOperation({
      base: {},
      model: "OutboundEmail",
      operation: "count",
      args: { where: { status: "QUEUED" } },
      query,
      resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
    });
    expect(result).toEqual({
      where: { AND: [{ status: "QUEUED" }, { client: { organisationId: "org_a" } }] },
    });
  });

  it("hides another organisation's row from findUnique and blocks the update", async () => {
    const base = baseWith([{ id: "client-b", organisationId: "org_b" }]);
    const query = vi.fn(async () => ({ id: "client-b" }));
    const found = await enforceTenantOperation({
      base,
      model: "Client",
      operation: "findUnique",
      args: { where: { id: "client-b" } },
      query,
      resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
    });
    expect(found).toBeNull();
    expect(query).not.toHaveBeenCalled();

    await expect(
      enforceTenantOperation({
        base,
        model: "Client",
        operation: "update",
        args: { where: { id: "client-b" }, data: { name: "stolen" } },
        query,
        resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
      }),
    ).rejects.toBeInstanceOf(OrganisationScopeError);
  });

  it("stamps creates and refuses a client from another organisation", async () => {
    const base = baseWith([{ id: "client-b", organisationId: "org_b" }]);
    const query = vi.fn(async (args) => args);
    const stamped = await enforceTenantOperation({
      base,
      model: "AuditLog",
      operation: "create",
      args: { data: { action: "CREATE", entityType: "Client" } },
      query,
      resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
    });
    expect(stamped).toMatchObject({ data: { organisationId: "org_a" } });

    await expect(
      enforceTenantOperation({
        base,
        model: "OutboundEmail",
        operation: "create",
        args: { data: { clientId: "client-b", toEmail: "a@b.test" } },
        query,
        resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
      }),
    ).rejects.toBeInstanceOf(OrganisationScopeError);
  });

  it("checks each linked client once for a large createMany", async () => {
    const base = baseWith([
      { id: "client-a", organisationId: "org_a" },
      { id: "client-b", organisationId: "org_b" },
    ]);
    const query = vi.fn(async (args) => args);
    const rows = Array.from({ length: 500 }, (_, index) => ({ clientId: "client-a", toEmail: `p${String(index)}@a.test` }));
    await enforceTenantOperation({
      base,
      model: "OutboundEmail",
      operation: "createMany",
      args: { data: rows },
      query,
      resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(base.client.findFirst.mock.calls.length).toBeLessThanOrEqual(2);

    await expect(
      enforceTenantOperation({
        base,
        model: "OutboundEmail",
        operation: "createMany",
        args: { data: [...rows, { clientId: "client-b", toEmail: "x@b.test" }] },
        query,
        resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
      }),
    ).rejects.toBeInstanceOf(OrganisationScopeError);
  });

  it("preflights a compound unique key as scalar fields", async () => {
    const findFirst = vi.fn(async () => ({ clientId: "client-a" }));
    const query = vi.fn(async (args) => args);
    const where = { clientId_termId: { clientId: "client-a", termId: "term-1" } };
    await enforceTenantOperation({
      base: { clientBriefTermLink: { findFirst } },
      model: "ClientBriefTermLink",
      operation: "findUnique",
      args: { where },
      query,
      resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [{ clientId: "client-a", termId: "term-1" }, { client: { organisationId: "org_a" } }],
      },
      select: { clientId: true },
    });
    expect(query).toHaveBeenCalledWith({ where });
  });

  it("fails closed for a signed-in person who has not chosen an organisation", async () => {
    const query = vi.fn(async (args) => args);
    const listed = await enforceTenantOperation({
      base: {},
      model: "Client",
      operation: "findMany",
      args: {},
      query,
      resolveScope: closed,
    });
    expect(listed).toEqual({ where: { organisationId: "org_scope_closed" } });
    await expect(
      enforceTenantOperation({
        base: {},
        model: "Client",
        operation: "create",
        args: { data: { name: "x", slug: "x" } },
        query,
        resolveScope: closed,
      }),
    ).rejects.toBeInstanceOf(OrganisationScopeError);
  });

  it("lets an explicit system call and an organisation scope bypass the session", async () => {
    const query = vi.fn(async (args) => args);
    await runAsSystem(() =>
      enforceTenantOperation({
        base: {},
        model: "Client",
        operation: "findMany",
        args: {},
        query,
        resolveScope: closed,
      }),
    );
    expect(query).toHaveBeenCalledWith({});

    query.mockClear();
    await runInOrganisation("org_b", () =>
      enforceTenantOperation({
        base: {},
        model: "Client",
        operation: "findMany",
        args: {},
        query,
        resolveScope: async () => ({ kind: "organisation", organisationId: "org_a" }),
      }),
    );
    expect(query).toHaveBeenCalledWith({ where: { organisationId: "org_b" } });
  });
});
