import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLOSED_ORGANISATION_ID,
  TENANT_EXEMPT_MODELS,
  classifiedTenantModels,
  isTenantExemptModel,
  isTenantModel,
  mergeWhere,
  stampOrganisationOnCreate,
  tenantScopeWhere,
} from "./tenant-scope";

function schemaModels(): string[] {
  const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  return [...schema.matchAll(/^model (\w+)/gm)].map((match) => match[1] ?? "");
}

describe("tenant model classification", () => {
  it("classifies every Prisma model as scoped or explicitly exempt", () => {
    const classified = new Set([...classifiedTenantModels(), ...Object.keys(TENANT_EXEMPT_MODELS)]);
    const missing = schemaModels().filter((model) => !classified.has(model));
    expect(missing).toEqual([]);
  });

  it("does not scope a person, an organisation, or shared vocabulary", () => {
    expect(isTenantExemptModel("StaffUser")).toBe(true);
    expect(isTenantExemptModel("Organisation")).toBe(true);
    expect(isTenantModel("BriefTaxonomyTerm")).toBe(false);
    expect(tenantScopeWhere("StaffUser", "org_a")).toBeNull();
  });

  it("pins a client row and a mailbox secret to one organisation", () => {
    expect(tenantScopeWhere("Client", "org_a")).toEqual({ organisationId: "org_a" });
    expect(tenantScopeWhere("OutboundEmail", "org_a")).toEqual({
      client: { organisationId: "org_a" },
    });
    expect(tenantScopeWhere("MailboxIdentitySecret", "org_a")).toEqual({
      mailbox: { client: { organisationId: "org_a" } },
    });
    expect(tenantScopeWhere("OutboundProviderEvent", "org_a")).toEqual({
      OR: [
        { client: { organisationId: "org_a" } },
        { outbound: { client: { organisationId: "org_a" } } },
      ],
    });
  });
});

describe("tenant where and create stamps", () => {
  it("keeps an existing filter and adds the organisation", () => {
    expect(mergeWhere({ status: "QUEUED" }, { organisationId: "org_a" })).toEqual({
      AND: [{ status: "QUEUED" }, { organisationId: "org_a" }],
    });
    expect(mergeWhere(undefined, { organisationId: "org_a" })).toEqual({ organisationId: "org_a" });
  });

  it("stamps a missing organisation and refuses a different one", () => {
    expect(stampOrganisationOnCreate("AuditLog", { action: "CREATE" }, "org_a")).toEqual({
      data: { action: "CREATE", organisationId: "org_a" },
      violation: false,
    });
    expect(stampOrganisationOnCreate("Client", { organisationId: "org_b" }, "org_a").violation).toBe(
      true,
    );
    expect(CLOSED_ORGANISATION_ID).toBe("org_scope_closed");
  });
});

describe("Google logins badge", () => {
  it("counts mailboxes only inside the organisation it is given", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/server/queries/google-reconnects.ts"),
      "utf8",
    );
    expect(source).toContain("organisationId");
    expect(source).toContain("if (!organisationId) return 0");
    expect(source).not.toContain("Unscoped by accessible-client-ids");
  });
});
