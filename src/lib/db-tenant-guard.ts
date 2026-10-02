import { getOrganisationContext } from "@/lib/tenant/organisation-context";
import {
  CLOSED_ORGANISATION_ID,
  OrganisationScopeError,
  isTenantExemptModel,
  isTenantModel,
  mergeWhere,
  prismaDelegateKey,
  stampOrganisationOnCreate,
  tenantScopeWhere,
} from "@/server/tenant/tenant-scope";

/**
 * What the current call may touch.
 * `anonymous` is a process with no staff session (cron, webhook, script).
 * A signed-in person with no chosen organisation is `organisation` with the
 * closed id, which matches nothing.
 */
export type TenantScopeResolution =
  | { kind: "anonymous" }
  | { kind: "organisation"; organisationId: string };

type Query = (args: unknown) => Promise<unknown>;

type RowDelegate = {
  findFirst: (args: { where: unknown; select: Record<string, true> }) => Promise<unknown>;
};

const READS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const UNIQUE = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

const CREATES = new Set(["create", "createMany", "createManyAndReturn"]);

const MUTATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/** Immediate parent whose organisation decides whether a child row may be written. */
const PARENT_LINK: Record<string, { field: string; parent: string }> = {
  MailboxIdentitySecret: { field: "mailboxIdentityId", parent: "ClientMailboxIdentity" },
  ClientEmailSequenceStep: { field: "sequenceId", parent: "ClientEmailSequence" },
  SupportTicketNotification: { field: "ticketId", parent: "SupportTicket" },
  SupportTicketAttachment: { field: "ticketId", parent: "SupportTicket" },
  SupportTicketComment: { field: "ticketId", parent: "SupportTicket" },
  ContactUniverseSource: { field: "universeContactId", parent: "ContactUniverse" },
  ProspectResearchRun: { field: "planId", parent: "ProspectResearchPlan" },
  ProspectResearchRequest: { field: "runId", parent: "ProspectResearchRun" },
  ProspectResearchCandidate: { field: "requestId", parent: "ProspectResearchRequest" },
  AiOutreachCampaignEvent: { field: "campaignId", parent: "AiOutreachCampaign" },
  OutboundProviderEvent: { field: "outboundEmailId", parent: "OutboundEmail" },
};

function argsRecord(args: unknown): Record<string, unknown> {
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
    return { ...(args as Record<string, unknown>) };
  }
  return {};
}

function readScalarId(data: unknown, field: string): string | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readConnectId(data: unknown, relation: string): string | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const rel = (data as Record<string, unknown>)[relation];
  if (rel === null || typeof rel !== "object" || Array.isArray(rel)) return null;
  const connect = (rel as Record<string, unknown>).connect;
  if (connect === null || typeof connect !== "object" || Array.isArray(connect)) return null;
  const id = (connect as Record<string, unknown>).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function existenceSelect(model: string): Record<string, true> {
  if (model === "ClientBriefTermLink") return { clientId: true };
  return { id: true };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * `findUnique` accepts a compound key such as `{ clientId_termId: { clientId, termId } }`.
 * The preflight uses `findFirst`, which only accepts the scalar fields.
 */
function flattenUniqueWhere(where: unknown): unknown {
  if (!isPlainRecord(where)) return where;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (isPlainRecord(value) && key.includes("_")) {
      const parts = key.split("_");
      const fields = Object.keys(value);
      if (fields.length === parts.length && fields.every((field) => parts.includes(field))) {
        Object.assign(out, value);
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

function delegate(base: object, model: string): RowDelegate {
  const key = prismaDelegateKey(model);
  const value = (base as Record<string, RowDelegate | undefined>)[key];
  if (!value || typeof value.findFirst !== "function") {
    throw new OrganisationScopeError("ORGANISATION_SCOPE_UNCLASSIFIED");
  }
  return value;
}

/** in = this organisation, out = a different one, absent = not committed yet. */
async function visibility(
  base: object,
  model: string,
  where: unknown,
  organisationId: string,
): Promise<"in" | "out" | "absent"> {
  const scope = tenantScopeWhere(model, organisationId);
  if (!scope) return "in";
  const rows = delegate(base, model);
  const select = existenceSelect(model);
  const flatWhere = flattenUniqueWhere(where);
  const inside = await rows.findFirst({ where: mergeWhere(flatWhere, scope), select });
  if (inside) return "in";
  const anywhere = await rows.findFirst({ where: flatWhere, select });
  return anywhere ? "out" : "absent";
}

async function assertRowInScope(
  base: object,
  model: string,
  where: unknown,
  organisationId: string,
): Promise<void> {
  const state = await visibility(base, model, where, organisationId);
  if (state === "out") throw new OrganisationScopeError("ORGANISATION_SCOPE_DENIED");
}

function assertOrganisationField(data: unknown, organisationId: string): void {
  const current = readScalarId(data, "organisationId");
  if (current && current !== organisationId) {
    throw new OrganisationScopeError("ORGANISATION_SCOPE_DENIED");
  }
}

async function assertCreateLinks(
  base: object,
  model: string,
  data: unknown,
  organisationId: string,
): Promise<void> {
  assertOrganisationField(data, organisationId);
  const clientId = readScalarId(data, "clientId") ?? readConnectId(data, "client");
  if (clientId) await assertRowInScope(base, "Client", { id: clientId }, organisationId);
  const parent = PARENT_LINK[model];
  if (!parent) return;
  const parentId = readScalarId(data, parent.field) ?? readConnectId(data, parent.field);
  if (parentId) await assertRowInScope(base, parent.parent, { id: parentId }, organisationId);
}

function stampCreateArgs(
  model: string,
  args: Record<string, unknown>,
  organisationId: string,
): Record<string, unknown> {
  const data = args.data;
  if (Array.isArray(data)) {
    const stamped = data.map((row) => {
      const result = stampOrganisationOnCreate(model, row, organisationId);
      if (result.violation) throw new OrganisationScopeError("ORGANISATION_SCOPE_DENIED");
      return result.data;
    });
    return { ...args, data: stamped };
  }
  const result = stampOrganisationOnCreate(model, data, organisationId);
  if (result.violation) throw new OrganisationScopeError("ORGANISATION_SCOPE_DENIED");
  return { ...args, data: result.data };
}

/**
 * Force one Prisma operation onto the active organisation, or leave it
 * alone when there is no staff session and nobody has opted into a scope.
 * A missing scope for a signed-in person fails closed. An unknown tenant
 * operation fails closed rather than running unfiltered.
 */
export async function enforceTenantOperation(input: {
  base: object;
  model: string;
  operation: string;
  args: unknown;
  query: Query;
  resolveScope: () => Promise<TenantScopeResolution>;
}): Promise<unknown> {
  const { model, operation } = input;
  if (isTenantExemptModel(model)) return input.query(input.args);

  const als = getOrganisationContext();
  if (als?.kind === "system" || als?.kind === "resolving") return input.query(input.args);

  if (!isTenantModel(model)) {
    const probed = als?.kind === "organisation"
      ? { kind: "organisation" as const, organisationId: als.organisationId }
      : await input.resolveScope();
    if (probed.kind === "organisation") {
      throw new OrganisationScopeError("ORGANISATION_SCOPE_UNCLASSIFIED");
    }
    return input.query(input.args);
  }

  const scope = als?.kind === "organisation"
    ? { kind: "organisation" as const, organisationId: als.organisationId }
    : await input.resolveScope();
  if (scope.kind === "anonymous") return input.query(input.args);

  const organisationId = scope.organisationId;
  const args = argsRecord(input.args);

  if (organisationId === CLOSED_ORGANISATION_ID && MUTATIONS.has(operation)) {
    throw new OrganisationScopeError("ORGANISATION_SCOPE_REQUIRED");
  }

  if (READS.has(operation) || operation === "updateMany" || operation === "updateManyAndReturn" || operation === "deleteMany") {
    const extra = tenantScopeWhere(model, organisationId);
    if (!extra) throw new OrganisationScopeError("ORGANISATION_SCOPE_UNCLASSIFIED");
    return input.query({ ...args, where: mergeWhere(args.where, extra) });
  }

  if (CREATES.has(operation)) {
    const stamped = stampCreateArgs(model, args, organisationId);
    const data = stamped.data;
    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      await assertCreateLinks(input.base, model, row, organisationId);
    }
    return input.query(stamped);
  }

  if (UNIQUE.has(operation)) {
    const state = await visibility(input.base, model, args.where, organisationId);
    if (state === "out") {
      if (operation === "findUnique") return null;
      throw new OrganisationScopeError("ORGANISATION_SCOPE_DENIED");
    }
    if (operation === "upsert") {
      const create = stampOrganisationOnCreate(model, args.create, organisationId);
      if (create.violation) throw new OrganisationScopeError("ORGANISATION_SCOPE_DENIED");
      assertOrganisationField(args.update, organisationId);
      await assertCreateLinks(input.base, model, create.data, organisationId);
      return input.query({ ...args, create: create.data });
    }
    if (operation === "update") assertOrganisationField(args.data, organisationId);
    return input.query(args);
  }

  throw new OrganisationScopeError("ORGANISATION_SCOPE_UNCLASSIFIED");
}
