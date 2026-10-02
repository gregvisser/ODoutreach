/**
 * How a Prisma model is pinned to one organisation.
 * Pure: no database. The Prisma guard in `src/lib/db.ts` applies this
 * and refuses a tenant query that has a scope but does not match it.
 */

export class OrganisationScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganisationScopeError";
  }
}

/** Matches no real organisation. Used when a signed-in person has not chosen one. */
export const CLOSED_ORGANISATION_ID = "org_scope_closed";

/**
 * Models that are not one organisation's data.
 *
 * StaffUser is a person, and one person may belong to several organisations.
 * Lists of people filter on OrganisationMember.
 * Organisation is the tenant root.
 * OrganisationMember is the membership itself; auto-filtering it would hide
 * the other organisations a person belongs to while they are choosing.
 * GlobalBrandSetting is the legacy OpensDoors singleton. Live brand fields
 * live on Organisation, and only OpensDoors still mirrors them here.
 * BriefTaxonomyTerm is shared vocabulary (a job title, an industry). The
 * per-client link is ClientBriefTermLink, which is scoped. The term row
 * does not store a prospect.
 * TrainingAssistantUnansweredQuestion is a staff question about the product,
 * not a prospect. Nothing lists these across organisations.
 */
export const TENANT_EXEMPT_MODELS = {
  StaffUser: "A person may belong to several organisations.",
  Organisation: "The tenant root.",
  OrganisationMember: "Membership rows are how a person is attached to organisations.",
  GlobalBrandSetting: "Legacy OpensDoors brand singleton. Other organisations use Organisation.",
  BriefTaxonomyTerm: "Shared brief vocabulary. Client links are scoped separately.",
  TrainingAssistantUnansweredQuestion: "Product questions, not prospect or client data.",
} as const;

export type TenantExemptModel = keyof typeof TENANT_EXEMPT_MODELS;

/** organisationId column on the row itself. */
const DIRECT: readonly string[] = [
  "Client",
  "ContactUniverse",
  "InternalSeedAddress",
  "SupportTicket",
  "AuditLog",
  "AiUsageEvent",
];

/** client.organisationId */
const VIA_CLIENT: readonly string[] = [
  "ClientSendingCalendar",
  "ClientBriefTermLink",
  "ClientComplianceAttachment",
  "ClientMailboxIdentity",
  "InboundMailboxMessage",
  "ReplyClaim",
  "ClientMembership",
  "ClientOnboarding",
  "ContactImportBatch",
  "Contact",
  "ContactList",
  "ContactListMember",
  "RocketReachEnrichment",
  "SuppressionSource",
  "SuppressedEmail",
  "SuppressedDomainFamily",
  "SuppressedDomainFamilyProposal",
  "SuppressedDomain",
  "UnsubscribeToken",
  "Campaign",
  "ClientEmailTemplate",
  "ClientEmailSequence",
  "ClientEmailSequenceEnrollment",
  "ClientEmailSequenceStepSend",
  "OutboundEmail",
  "MailboxSendReservation",
  "InboundReply",
  "ReportingDailySnapshot",
  "CompanyDncSheetSource",
  "CompanyDncEntry",
  "CompanyDncDecision",
  "AiSequenceDraftRun",
  "AiCampaignReview",
  "AiSendTimeAdvice",
  "AiRepPerformanceReview",
  "AiTitleMessageReview",
  "ProspectResearchPlan",
  "RocketReachPlanRun",
  "RocketReachCreditReservation",
  "SequenceListRefillRule",
  "AiOutreachCampaign",
];

/** Nested relation path ending in organisationId. */
const VIA_PATH: Record<string, readonly string[]> = {
  MailboxIdentitySecret: ["mailbox", "client", "organisationId"],
  ClientEmailSequenceStep: ["sequence", "client", "organisationId"],
  SupportTicketNotification: ["ticket", "organisationId"],
  SupportTicketAttachment: ["ticket", "organisationId"],
  SupportTicketComment: ["ticket", "organisationId"],
  ContactUniverseSource: ["universe", "organisationId"],
  ProspectResearchRun: ["plan", "client", "organisationId"],
  ProspectResearchRequest: ["run", "plan", "client", "organisationId"],
  ProspectResearchCandidate: ["request", "run", "plan", "client", "organisationId"],
  AiOutreachCampaignEvent: ["campaign", "client", "organisationId"],
};

const DIRECT_SET = new Set(DIRECT);

export function isTenantExemptModel(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(TENANT_EXEMPT_MODELS, model);
}

export function isDirectOrganisationModel(model: string): boolean {
  return DIRECT_SET.has(model);
}

function nest(path: readonly string[], organisationId: string): Record<string, unknown> {
  const [head, ...rest] = path;
  if (!head) return {};
  if (rest.length === 0) return { [head]: organisationId };
  return { [head]: nest(rest, organisationId) };
}

/**
 * Prisma `where` fragment that keeps a tenant model inside one organisation.
 * Null means the model is exempt. OutboundProviderEvent can point at a client
 * or only at an outbound row; either path must match, and a row with neither
 * stays hidden.
 */
export function tenantScopeWhere(
  model: string,
  organisationId: string,
): Record<string, unknown> | null {
  if (isTenantExemptModel(model)) return null;
  if (model === "OutboundProviderEvent") {
    return {
      OR: [
        { client: { organisationId } },
        { outbound: { client: { organisationId } } },
      ],
    };
  }
  if (DIRECT_SET.has(model)) return { organisationId };
  if (VIA_CLIENT.includes(model)) return { client: { organisationId } };
  const path = VIA_PATH[model];
  if (path) return nest(path, organisationId);
  return null;
}

export function isTenantModel(model: string): boolean {
  return tenantScopeWhere(model, "org_probe") !== null;
}

export function mergeWhere(existing: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  if (existing === undefined || existing === null) return extra;
  if (typeof existing !== "object" || Array.isArray(existing)) {
    return { AND: [existing, extra] };
  }
  if (Object.keys(existing).length === 0) return extra;
  return { AND: [existing, extra] };
}

export function stampOrganisationOnCreate(
  model: string,
  data: unknown,
  organisationId: string,
): { data: unknown; violation: boolean } {
  if (!DIRECT_SET.has(model) || data === null || typeof data !== "object" || Array.isArray(data)) {
    return { data, violation: false };
  }
  const record = data as Record<string, unknown>;
  const current = record.organisationId;
  if (typeof current === "string" && current.length > 0 && current !== organisationId) {
    return { data, violation: true };
  }
  if (current === organisationId) return { data, violation: false };
  return { data: { ...record, organisationId }, violation: false };
}

export function clientIdFromCreateData(data: unknown): string | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const clientId = (data as Record<string, unknown>).clientId;
  return typeof clientId === "string" && clientId.length > 0 ? clientId : null;
}

export function prismaDelegateKey(model: string): string {
  return model.slice(0, 1).toLowerCase() + model.slice(1);
}

/** Every model the guard knows about, for the schema coverage test. */
export function classifiedTenantModels(): string[] {
  return [...DIRECT, ...VIA_CLIENT, ...Object.keys(VIA_PATH), "OutboundProviderEvent"];
}
