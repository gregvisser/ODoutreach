import { afterAll, beforeEach, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { runInOrganisation } from "@/lib/tenant/organisation-context";
import { findMailboxAddressConflicts } from "@/server/mailbox/mailbox-address-exclusivity";
import { getGoogleReconnectNeedsAttentionCount } from "@/server/queries/google-reconnects";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";
import { OrganisationScopeError, classifiedTenantModels, prismaDelegateKey } from "@/server/tenant/tenant-scope";

const ORG_A = "org_iso_a";
const ORG_B = "org_iso_b";
const at = new Date("2026-03-01T12:00:00.000Z");

type Delegate = {
  findUnique: (args: { where: { id: string } }) => Promise<unknown>;
  count: (args: { where: { id: string } }) => Promise<number>;
  update: (args: { where: { id: string }; data: { id?: string } }) => Promise<unknown>;
};

function delegate(model: string): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[prismaDelegateKey(model)] as Delegate;
}

async function seedSide(tag: "a" | "b", organisationId: string, staffId: string): Promise<Record<string, string>> {
  const id = (name: string) => `iso-${tag}-${name}`;
  const ids: Record<string, string> = {};
  const clientId = id("client");
  ids.Client = clientId;
  await prisma.client.create({
    data: { id: clientId, name: `Iso ${tag}`, slug: `iso-${tag}`, organisationId, status: "ACTIVE" },
  });
  ids.ClientSendingCalendar = id("cal");
  await prisma.clientSendingCalendar.create({
    data: {
      id: ids.ClientSendingCalendar,
      clientId,
      timeZone: "Europe/London",
      weekdays: [1, 2, 3, 4, 5],
      startMinute: 540,
      endMinute: 1020,
      previousDayEndsAt: at,
      effectiveAt: at,
      createdByStaffUserId: staffId,
    },
  });
  ids.ClientBriefTermLink = id("term-link");
  ids.ClientComplianceAttachment = id("file");
  await prisma.clientComplianceAttachment.create({
    data: {
      id: ids.ClientComplianceAttachment,
      clientId,
      fileName: "note.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
      data: Buffer.from("x"),
    },
  });
  ids.ClientMailboxIdentity = id("box");
  await prisma.clientMailboxIdentity.create({
    data: {
      id: ids.ClientMailboxIdentity,
      clientId,
      provider: "GOOGLE",
      email: `box-${tag}@iso.example`,
      emailNormalized: `box-${tag}@iso.example`,
      isActive: true,
      connectionStatus: "PENDING_CONNECTION",
    },
  });
  ids.MailboxIdentitySecret = id("secret");
  await prisma.mailboxIdentitySecret.create({
    data: {
      id: ids.MailboxIdentitySecret,
      mailboxIdentityId: ids.ClientMailboxIdentity,
      provider: "GOOGLE",
      encryptedCredential: "sealed",
    },
  });
  ids.InboundMailboxMessage = id("msg");
  await prisma.inboundMailboxMessage.create({
    data: {
      id: ids.InboundMailboxMessage,
      clientId,
      mailboxIdentityId: ids.ClientMailboxIdentity,
      providerMessageId: `msg-${tag}`,
      fromEmail: `from-${tag}@iso.example`,
      receivedAt: at,
    },
  });
  ids.ReplyClaim = id("claim");
  await prisma.replyClaim.create({
    data: {
      id: ids.ReplyClaim,
      clientId,
      subjectType: "INBOUND_MESSAGE",
      subjectId: ids.InboundMailboxMessage,
      staffUserId: staffId,
    },
  });
  ids.ClientMembership = id("member");
  await prisma.clientMembership.create({
    data: { id: ids.ClientMembership, staffUserId: staffId, clientId },
  });
  ids.ClientOnboarding = id("onboard");
  await prisma.clientOnboarding.create({ data: { id: ids.ClientOnboarding, clientId } });
  ids.ContactImportBatch = id("batch");
  await prisma.contactImportBatch.create({ data: { id: ids.ContactImportBatch, clientId } });
  ids.Contact = id("contact");
  await prisma.contact.create({
    data: { id: ids.Contact, clientId, email: `person-${tag}@iso.example` },
  });
  ids.ContactUniverse = id("universe");
  await prisma.contactUniverse.create({
    data: { id: ids.ContactUniverse, organisationId, emailNormalized: `universe-${tag}@iso.example` },
  });
  ids.ContactUniverseSource = id("source");
  await prisma.contactUniverseSource.create({
    data: {
      id: ids.ContactUniverseSource,
      universeContactId: ids.ContactUniverse,
      clientId,
      sourceType: "CSV_IMPORT",
    },
  });
  ids.ContactList = id("list");
  await prisma.contactList.create({ data: { id: ids.ContactList, name: `List ${tag}`, clientId } });
  ids.ContactListMember = id("list-member");
  await prisma.contactListMember.create({
    data: {
      id: ids.ContactListMember,
      contactListId: ids.ContactList,
      contactId: ids.Contact,
      clientId,
    },
  });
  ids.RocketReachEnrichment = id("rr");
  await prisma.rocketReachEnrichment.create({ data: { id: ids.RocketReachEnrichment, clientId } });
  ids.SuppressionSource = id("sup-src");
  await prisma.suppressionSource.create({
    data: { id: ids.SuppressionSource, clientId, kind: "EMAIL" },
  });
  ids.SuppressedEmail = id("sup-email");
  await prisma.suppressedEmail.create({
    data: { id: ids.SuppressedEmail, clientId, email: `blocked-${tag}@iso.example` },
  });
  ids.SuppressedDomainFamily = id("family");
  await prisma.suppressedDomainFamily.create({
    data: { id: ids.SuppressedDomainFamily, clientId, label: `Family ${tag}`, domain: `${tag}.example` },
  });
  ids.SuppressedDomainFamilyProposal = id("proposal");
  await prisma.suppressedDomainFamilyProposal.create({
    data: {
      id: ids.SuppressedDomainFamilyProposal,
      clientId,
      seedDomain: `seed-${tag}.example`,
      proposedDomain: `proposed-${tag}.example`,
      source: "DMARC_RUA",
      evidence: "same registrar",
      fanIn: 1,
    },
  });
  ids.SuppressedDomain = id("domain");
  await prisma.suppressedDomain.create({
    data: { id: ids.SuppressedDomain, clientId, domain: `blocked-${tag}.example` },
  });
  ids.InternalSeedAddress = id("seed");
  await prisma.internalSeedAddress.create({
    data: { id: ids.InternalSeedAddress, organisationId, email: `seed-${tag}@iso.example` },
  });
  ids.UnsubscribeToken = id("unsub");
  await prisma.unsubscribeToken.create({
    data: { id: ids.UnsubscribeToken, tokenHash: `hash-${tag}`, clientId, email: `person-${tag}@iso.example` },
  });
  ids.Campaign = id("campaign");
  await prisma.campaign.create({ data: { id: ids.Campaign, clientId, name: `Campaign ${tag}` } });
  ids.ClientEmailTemplate = id("template");
  await prisma.clientEmailTemplate.create({
    data: {
      id: ids.ClientEmailTemplate,
      clientId,
      name: `Template ${tag}`,
      category: "INTRODUCTION",
      subject: "Hello",
      content: "Hello",
    },
  });
  ids.ClientEmailSequence = id("sequence");
  await prisma.clientEmailSequence.create({
    data: { id: ids.ClientEmailSequence, clientId, contactListId: ids.ContactList, name: `Sequence ${tag}` },
  });
  ids.ClientEmailSequenceStep = id("step");
  await prisma.clientEmailSequenceStep.create({
    data: {
      id: ids.ClientEmailSequenceStep,
      sequenceId: ids.ClientEmailSequence,
      templateId: ids.ClientEmailTemplate,
      category: "INTRODUCTION",
      position: 0,
    },
  });
  ids.ClientEmailSequenceEnrollment = id("enrol");
  await prisma.clientEmailSequenceEnrollment.create({
    data: {
      id: ids.ClientEmailSequenceEnrollment,
      clientId,
      sequenceId: ids.ClientEmailSequence,
      contactId: ids.Contact,
      contactListId: ids.ContactList,
    },
  });
  ids.ClientEmailSequenceStepSend = id("send");
  await prisma.clientEmailSequenceStepSend.create({
    data: {
      id: ids.ClientEmailSequenceStepSend,
      clientId,
      sequenceId: ids.ClientEmailSequence,
      enrollmentId: ids.ClientEmailSequenceEnrollment,
      stepId: ids.ClientEmailSequenceStep,
      templateId: ids.ClientEmailTemplate,
      contactId: ids.Contact,
      contactListId: ids.ContactList,
      idempotencyKey: `idem-${tag}`,
    },
  });
  ids.OutboundEmail = id("outbound");
  await prisma.outboundEmail.create({
    data: { id: ids.OutboundEmail, clientId, toEmail: `person-${tag}@iso.example` },
  });
  ids.MailboxSendReservation = id("reserve");
  await prisma.mailboxSendReservation.create({
    data: {
      id: ids.MailboxSendReservation,
      clientId,
      mailboxIdentityId: ids.ClientMailboxIdentity,
      idempotencyKey: `res-${tag}`,
      windowKey: "2026-03-01",
    },
  });
  ids.OutboundProviderEvent = id("event");
  await prisma.outboundProviderEvent.create({
    data: {
      id: ids.OutboundProviderEvent,
      clientId,
      outboundEmailId: ids.OutboundEmail,
      providerName: "mock",
      eventType: "delivered",
      dedupeHash: `dedupe-${tag}`,
    },
  });
  ids.InboundReply = id("reply");
  await prisma.inboundReply.create({
    data: { id: ids.InboundReply, clientId, fromEmail: `person-${tag}@iso.example`, receivedAt: at },
  });
  ids.ReportingDailySnapshot = id("snap");
  await prisma.reportingDailySnapshot.create({
    data: { id: ids.ReportingDailySnapshot, clientId, date: at },
  });
  ids.CompanyDncSheetSource = id("sheet");
  await prisma.companyDncSheetSource.create({
    data: { id: ids.CompanyDncSheetSource, clientId, spreadsheetId: `sheet-${tag}`, tabName: "Companies" },
  });
  ids.CompanyDncEntry = id("dnc");
  await prisma.companyDncEntry.create({
    data: { id: ids.CompanyDncEntry, clientId, originalName: `Acme ${tag}`, canonicalName: `acme ${tag}` },
  });
  ids.CompanyDncDecision = id("decision");
  await prisma.companyDncDecision.create({
    data: {
      id: ids.CompanyDncDecision,
      clientId,
      entryId: ids.CompanyDncEntry,
      companyKey: `acme ${tag}`,
      ruleVersion: 1,
      outcome: "ALLOW",
    },
  });
  ids.AuditLog = id("audit");
  await prisma.auditLog.create({
    data: { id: ids.AuditLog, organisationId, clientId, action: "CREATE", entityType: "Client", entityId: clientId },
  });
  ids.AiUsageEvent = id("spend");
  await prisma.aiUsageEvent.create({
    data: {
      id: ids.AiUsageEvent,
      organisationId,
      clientId,
      clientSlugAtCall: `iso-${tag}`,
      feature: "REPLY_CLASSIFICATION",
      status: "OK",
      model: "test",
      rateVersion: "v1",
    },
  });
  ids.AiSequenceDraftRun = id("draft");
  await prisma.aiSequenceDraftRun.create({
    data: { id: ids.AiSequenceDraftRun, clientId, status: "QUEUED" },
  });
  ids.AiCampaignReview = id("review");
  await prisma.aiCampaignReview.create({
    data: {
      id: ids.AiCampaignReview,
      clientId,
      sequenceId: ids.ClientEmailSequence,
      score: 1,
      summary: "ok",
      findings: [],
      model: "test",
      promptVersion: "v1",
    },
  });
  ids.AiSendTimeAdvice = id("time");
  await prisma.aiSendTimeAdvice.create({
    data: {
      id: ids.AiSendTimeAdvice,
      clientId,
      summary: "ok",
      windows: [],
      cautions: [],
      evidence: {},
      totalSent: 0,
      totalReplied: 0,
      lookbackDays: 7,
      model: "test",
      promptVersion: "v1",
    },
  });
  ids.AiRepPerformanceReview = id("rep");
  await prisma.aiRepPerformanceReview.create({
    data: {
      id: ids.AiRepPerformanceReview,
      clientId,
      summary: "ok",
      findings: [],
      cautions: [],
      evidence: {},
      totalSent: 0,
      totalReplied: 0,
      totalPositive: 0,
      lookbackDays: 7,
      anyDistinguishable: false,
      model: "test",
      promptVersion: "v1",
    },
  });
  ids.AiTitleMessageReview = id("title");
  await prisma.aiTitleMessageReview.create({
    data: {
      id: ids.AiTitleMessageReview,
      clientId,
      summary: "ok",
      findings: [],
      cautions: [],
      evidence: {},
      coverage: {},
      totalReplied: 0,
      totalPositive: 0,
      lookbackDays: 7,
      comparisonCount: 0,
      zThresholdMilli: 1,
      anyDistinguishable: false,
      model: "test",
      promptVersion: "v1",
    },
  });
  ids.ProspectResearchPlan = id("plan");
  await prisma.prospectResearchPlan.create({
    data: {
      id: ids.ProspectResearchPlan,
      clientId,
      name: `Plan ${tag}`,
      criteria: {},
      maxLookups: 1,
      createdByStaffId: staffId,
    },
  });
  ids.ProspectResearchRun = id("run");
  await prisma.prospectResearchRun.create({
    data: { id: ids.ProspectResearchRun, planId: ids.ProspectResearchPlan, approvedByStaffId: staffId, maxLookups: 1 },
  });
  ids.ProspectResearchRequest = id("request");
  await prisma.prospectResearchRequest.create({
    data: { id: ids.ProspectResearchRequest, runId: ids.ProspectResearchRun, requestKey: `key-${tag}`, kind: "SEARCH" },
  });
  ids.ProspectResearchCandidate = id("candidate");
  await prisma.prospectResearchCandidate.create({
    data: {
      id: ids.ProspectResearchCandidate,
      requestId: ids.ProspectResearchRequest,
      providerProfileId: `profile-${tag}`,
      evidence: {},
      decision: {},
    },
  });
  ids.RocketReachPlanRun = id("rr-run");
  await prisma.rocketReachPlanRun.create({
    data: {
      id: ids.RocketReachPlanRun,
      clientId,
      planId: ids.ProspectResearchPlan,
      trigger: "MANUAL",
      status: "RUNNING",
      skipped: {},
    },
  });
  ids.RocketReachCreditReservation = id("credit");
  await prisma.rocketReachCreditReservation.create({
    data: { id: ids.RocketReachCreditReservation, clientId, runId: ids.RocketReachPlanRun, profileId: `profile-${tag}` },
  });
  ids.SequenceListRefillRule = id("refill");
  await prisma.sequenceListRefillRule.create({
    data: {
      id: ids.SequenceListRefillRule,
      sequenceId: ids.ClientEmailSequence,
      clientId,
      planId: ids.ProspectResearchPlan,
      lowWaterMark: 1,
      maxCreditsPerRun: 1,
      maxCreditsPerDay: 1,
      maxCreditsPerMonth: 1,
      balanceFloor: 0,
    },
  });
  ids.AiOutreachCampaign = id("ai-campaign");
  await prisma.aiOutreachCampaign.create({
    data: {
      id: ids.AiOutreachCampaign,
      clientId,
      name: `AI ${tag}`,
      brief: "brief",
      targetContactCount: 1,
      creditBudgetTotal: 1,
      creditBudgetPerDay: 1,
      createdByStaffUserId: staffId,
    },
  });
  ids.AiOutreachCampaignEvent = id("ai-event");
  await prisma.aiOutreachCampaignEvent.create({
    data: {
      id: ids.AiOutreachCampaignEvent,
      campaignId: ids.AiOutreachCampaign,
      stage: "start",
      kind: "note",
      message: "hello",
    },
  });
  ids.SupportTicket = id("ticket");
  await prisma.supportTicket.create({
    data: {
      id: ids.SupportTicket,
      organisationId,
      title: `Ticket ${tag}`,
      description: "help",
      reporterEmail: `reporter-${tag}@iso.example`,
    },
  });
  ids.SupportTicketNotification = id("notice");
  await prisma.supportTicketNotification.create({
    data: {
      id: ids.SupportTicketNotification,
      ticketId: ids.SupportTicket,
      resolutionVersion: 1,
      recipientEmail: `reporter-${tag}@iso.example`,
      subject: "update",
      body: "update",
    },
  });
  ids.SupportTicketAttachment = id("attach");
  await prisma.supportTicketAttachment.create({
    data: {
      id: ids.SupportTicketAttachment,
      ticketId: ids.SupportTicket,
      fileName: "shot.png",
      mimeType: "image/png",
      sizeBytes: 1,
      data: Buffer.from("x"),
    },
  });
  ids.SupportTicketComment = id("comment");
  await prisma.supportTicketComment.create({
    data: {
      id: ids.SupportTicketComment,
      ticketId: ids.SupportTicket,
      body: "note",
      authorEmail: `reporter-${tag}@iso.example`,
    },
  });
  return ids;
}

beforeEach(async () => {
  await resetIntegrationDatabase();
  await prisma.organisation.createMany({
    data: [
      { id: ORG_A, name: "Iso A", slug: "iso-a", status: "ACTIVE" },
      { id: ORG_B, name: "Iso B", slug: "iso-b", status: "ACTIVE" },
    ],
  });
  await prisma.staffUser.create({
    data: { id: "iso-staff", entraObjectId: "iso-staff-oid", email: "iso-staff@iso.example", role: "ADMIN" },
  });
  await prisma.briefTaxonomyTerm.create({
    data: { id: "iso-term", kind: "JOB_TITLE", normalizedValue: "buyer", displayValue: "Buyer" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});

it("hides every scoped model of one organisation from the other, including direct ids", async () => {
  const sideA = await seedSide("a", ORG_A, "iso-staff");
  const sideB = await seedSide("b", ORG_B, "iso-staff");
  await prisma.clientBriefTermLink.create({ data: { clientId: sideA.Client, termId: "iso-term" } });
  await prisma.clientBriefTermLink.create({ data: { clientId: sideB.Client, termId: "iso-term" } });

  const scoped = classifiedTenantModels().filter((model) => model !== "ClientBriefTermLink");
  const missing = scoped.filter((model) => !sideB[model]);
  expect(missing).toEqual([]);

  await runInOrganisation(ORG_A, async () => {
    for (const model of scoped) {
      const rowId = sideB[model] as string;
      expect(await delegate(model).findUnique({ where: { id: rowId } }), model).toBeNull();
      expect(await delegate(model).count({ where: { id: rowId } }), model).toBe(0);
      await expect(
        delegate(model).update({ where: { id: rowId }, data: {} }),
        model,
      ).rejects.toBeInstanceOf(OrganisationScopeError);
      expect(await delegate(model).findUnique({ where: { id: sideA[model] as string } }), model).not.toBeNull();
    }
    expect(
      await prisma.clientBriefTermLink.findUnique({
        where: { clientId_termId: { clientId: sideB.Client, termId: "iso-term" } },
      }),
    ).toBeNull();
    expect(await getGoogleReconnectNeedsAttentionCount(ORG_A)).toBe(1);
    expect(await getGoogleReconnectNeedsAttentionCount(ORG_B)).toBe(0);
  });

  await runInOrganisation(ORG_B, async () => {
    expect(await prisma.client.findUnique({ where: { id: sideA.Client } })).toBeNull();
    expect(await getGoogleReconnectNeedsAttentionCount(ORG_B)).toBe(1);
  });

  const conflicts = await findMailboxAddressConflicts({
    emailNormalized: "shared-iso@iso.example",
    clientId: sideA.Client,
  });
  expect(conflicts).toEqual([]);
  await prisma.clientMailboxIdentity.create({
    data: {
      id: "iso-shared-b",
      clientId: sideB.Client,
      provider: "MICROSOFT",
      email: "shared-iso@iso.example",
      emailNormalized: "shared-iso@iso.example",
    },
  });
  const cross = await findMailboxAddressConflicts({
    emailNormalized: "shared-iso@iso.example",
    clientId: sideA.Client,
  });
  expect(cross).toHaveLength(1);
  expect(cross[0]?.clientName).toBe("another organisation");
});
