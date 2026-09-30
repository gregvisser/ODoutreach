import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

import { tickAiCampaignsForClient } from "./tick";

/**
 * One confirmation has already been given. The scheduled tick must source
 * this client's people, enroll the ones who pass the same recipient gates
 * as Review recipients, plan the introduction, and launch. Nobody clicks
 * Review recipients. A score under 75 is not exercised here: that stop stays.
 *
 * Drafting and the writing check are stubbed so the test does not call xAI.
 * RocketReach is not called because Universe already fills the target.
 */

const ai = vi.hoisted(() => ({
  draft: vi.fn(),
  review: vi.fn(),
}));

vi.mock("@/server/ai/draft-sequence", () => ({
  draftSequenceForClient: (args: { clientId: string; staffUserId: string }) => ai.draft(args),
}));

vi.mock("@/server/ai/review-campaign", () => ({
  reviewCampaign: (args: { clientId: string; sequenceId: string; staffUserId: string }) => ai.review(args),
}));

const CLIENT_ID = "itest-ai-chain-client";
const OTHER_CLIENT_ID = "itest-ai-chain-other";
const STAFF_ID = "itest-ai-chain-staff";
const CAMPAIGN_ID = "itest-ai-chain-campaign";
const MAILBOX_ID = "itest-ai-chain-mailbox";
const HUMAN_SEQUENCE_ID = "itest-ai-chain-human";
const SENDER_EMAIL = "outreach@chain.example.test";
const ADA = "ada@prospect.example.test";
const GRACE = "grace@prospect.example.test";
const BLOCKED = "blocked@dnc.example.test";
const OTHER = "other-client@prospect.example.test";
const SUPPRESSED_ON_LIST = "suppressed-on-list@prospect.example.test";

async function seedUniverse(input: {
  id: string;
  email: string | null;
  clientId: string;
  jobTitle: string;
  industry: string;
  country: string;
}): Promise<void> {
  await prisma.contactUniverse.create({
    data: {
      id: input.id,
      emailNormalized: input.email,
      fullName: "Pat Example",
      firstName: "Pat",
      lastName: "Example",
      jobTitle: input.jobTitle,
      companyName: "Example Mills",
      industry: input.industry,
      country: input.country,
      firstSeenClientId: input.clientId,
      firstSeenSourceType: "OTHER",
    },
  });
}

async function seedWorkspace(): Promise<void> {
  await prisma.client.create({
    data: {
      id: CLIENT_ID,
      name: "Chain Client",
      slug: "chain-client",
      status: "ACTIVE",
      defaultSenderEmail: SENDER_EMAIL,
      launchApprovedAt: new Date("2026-01-01T09:00:00.000Z"),
      outreachLinkDomain: "go.chain.example.test",
      outreachLinkDomainVerifiedAt: new Date("2026-01-01T09:00:00.000Z"),
    },
  });
  await prisma.client.create({
    data: {
      id: OTHER_CLIENT_ID,
      name: "Other Client",
      slug: "other-chain-client",
      status: "ACTIVE",
    },
  });
  await prisma.staffUser.create({
    data: {
      id: STAFF_ID,
      entraObjectId: "itest-ai-chain-oid",
      email: "ai-chain-staff@opensdoors.example",
      displayName: "AI chain admin",
      role: "ADMIN",
      isActive: true,
    },
  });
  await prisma.clientMailboxIdentity.create({
    data: {
      id: MAILBOX_ID,
      clientId: CLIENT_ID,
      provider: "GOOGLE",
      email: SENDER_EMAIL,
      emailNormalized: SENDER_EMAIL,
      isActive: true,
      canSend: true,
      isSendingEnabled: true,
      connectionStatus: "CONNECTED",
      connectedAt: new Date("2026-01-01T09:00:00.000Z"),
      senderDisplayName: "Chain Sender",
    },
  });
  await seedUniverse({
    id: "itest-ai-chain-ada",
    email: ADA,
    clientId: CLIENT_ID,
    jobTitle: "Facilities Manager",
    industry: "Agriculture",
    country: "United Kingdom",
  });
  await seedUniverse({
    id: "itest-ai-chain-grace",
    email: GRACE,
    clientId: CLIENT_ID,
    jobTitle: "Facilities Manager",
    industry: "Agriculture",
    country: "United Kingdom",
  });
  await seedUniverse({
    id: "itest-ai-chain-blocked",
    email: BLOCKED,
    clientId: CLIENT_ID,
    jobTitle: "Facilities Manager",
    industry: "Agriculture",
    country: "United Kingdom",
  });
  await seedUniverse({
    id: "itest-ai-chain-nomatch",
    email: "chef@prospect.example.test",
    clientId: CLIENT_ID,
    jobTitle: "Head Chef",
    industry: "Hospitality",
    country: "United Kingdom",
  });
  await seedUniverse({
    id: "itest-ai-chain-noemail",
    email: null,
    clientId: CLIENT_ID,
    jobTitle: "Facilities Manager",
    industry: "Agriculture",
    country: "United Kingdom",
  });
  await seedUniverse({
    id: "itest-ai-chain-other",
    email: OTHER,
    clientId: OTHER_CLIENT_ID,
    jobTitle: "Facilities Manager",
    industry: "Agriculture",
    country: "United Kingdom",
  });
  await prisma.suppressedEmail.create({
    data: { clientId: CLIENT_ID, email: BLOCKED },
  });
  await prisma.aiOutreachCampaign.create({
    data: {
      id: CAMPAIGN_ID,
      clientId: CLIENT_ID,
      name: "Chain campaign",
      status: "SOURCING",
      brief: "Contact facilities managers and offer a planned maintenance visit.",
      jobTitles: ["Facilities Manager"],
      countries: ["United Kingdom"],
      industries: ["Agriculture"],
      targetContactCount: 2,
      creditBudgetTotal: 20,
      creditBudgetPerDay: 5,
      createdByStaffUserId: STAFF_ID,
    },
  });
}

beforeEach(async () => {
  vi.stubEnv("AI_CAMPAIGNS_ENABLED", "true");
  vi.stubEnv("ROCKETREACH_API_KEY", "");
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "");
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("NETWORK BLOCKED: a test attempted a real HTTP request");
  }));
  ai.draft.mockImplementation(async (args: { clientId: string }) => {
    const template = await prisma.clientEmailTemplate.create({
      data: {
        clientId: args.clientId,
        name: "Introduction",
        category: "INTRODUCTION",
        subject: "Hello {{first_name}}",
        content: "Hi {{first_name}}, a quick note from {{sender_company_name}}.",
        status: "DRAFT",
      },
    });
    return {
      ok: true,
      templateIds: [template.id],
      steps: [{
        category: "INTRODUCTION",
        absoluteDay: 1,
        delayDays: 0,
        subject: "Hello {{first_name}}",
        body: "Hi {{first_name}}, a quick note from {{sender_company_name}}.",
      }],
      unknownPlaceholders: [],
      costMicroUsd: 0,
    };
  });
  ai.review.mockResolvedValue({
    ok: true,
    reviewId: "itest-ai-chain-review",
    score: 76,
    summary: "The writing is specific enough to send.",
    findings: [],
    costMicroUsd: 0,
  });
  await resetIntegrationDatabase();
  await seedWorkspace();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await prisma.$disconnect();
  await closeIntegrationPool();
});

describe("AI campaign tick from sourcing to launch", () => {
  it("sources, enrolls, plans, and launches with no staff action", async () => {
    const sourced = await tickAiCampaignsForClient(CLIENT_ID);
    expect(sourced.errors).toEqual([]);

    const afterSource = await prisma.aiOutreachCampaign.findUniqueOrThrow({ where: { id: CAMPAIGN_ID } });
    expect(afterSource.status).toBe("WRITING");
    expect(afterSource.contactsSourced).toBe(2);
    expect(afterSource.contactListId).toBeTruthy();
    expect(afterSource.sequenceId).toBeTruthy();
    const listId = afterSource.contactListId!;
    const sequenceId = afterSource.sequenceId!;

    const sourcedEmails = (
      await prisma.contact.findMany({
        where: { clientId: CLIENT_ID },
        select: { email: true },
      })
    ).map((row) => row.email).sort();
    expect(sourcedEmails).toEqual([ADA, GRACE].sort());
    expect(await prisma.contact.count({ where: { clientId: OTHER_CLIENT_ID } })).toBe(0);
    expect(await prisma.rocketReachPlanRun.count({ where: { clientId: CLIENT_ID } })).toBe(0);

    await prisma.contact.create({
      data: {
        id: "itest-ai-chain-suppressed",
        clientId: CLIENT_ID,
        email: SUPPRESSED_ON_LIST,
        firstName: "Sam",
        lastName: "Suppressed",
        company: "Example Mills",
        isSuppressed: true,
        source: "MANUAL",
      },
    });
    await prisma.contact.create({
      data: {
        id: "itest-ai-chain-no-email",
        clientId: CLIENT_ID,
        email: null,
        firstName: "No",
        lastName: "Email",
        company: "Example Mills",
        linkedIn: "https://www.linkedin.com/in/itest-ai-chain-no-email",
        source: "MANUAL",
      },
    });
    await prisma.contactListMember.createMany({
      data: [
        { contactListId: listId, contactId: "itest-ai-chain-suppressed", clientId: CLIENT_ID },
        { contactListId: listId, contactId: "itest-ai-chain-no-email", clientId: CLIENT_ID },
      ],
    });
    const sentAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.outboundEmail.create({
      data: {
        clientId: CLIENT_ID,
        toEmail: GRACE,
        status: "SENT",
        sentAt,
        queuedAt: sentAt,
      },
    });
    await prisma.clientEmailSequence.create({
      data: {
        id: HUMAN_SEQUENCE_ID,
        clientId: CLIENT_ID,
        name: "Hand-sent sequence",
        contactListId: listId,
        status: "APPROVED",
        createdByStaffUserId: STAFF_ID,
      },
    });

    const statuses: string[] = [afterSource.status];
    let launched: { status: string; staffAlert: string | null; consecutiveFailures: number } | null = null;
    for (let step = 0; step < 8; step += 1) {
      const result = await tickAiCampaignsForClient(CLIENT_ID);
      expect(result.errors).toEqual([]);
      const campaign = await prisma.aiOutreachCampaign.findUniqueOrThrow({
        where: { id: CAMPAIGN_ID },
        select: { status: true, staffAlert: true, consecutiveFailures: true },
      });
      statuses.push(campaign.status);
      if (campaign.status === "RUNNING") {
        launched = campaign;
        break;
      }
    }

    expect(launched).not.toBeNull();
    expect(launched?.staffAlert).toBeNull();
    expect(launched?.consecutiveFailures).toBe(0);
    expect(statuses).toEqual(["WRITING", "REVIEWING", "REVIEWING", "PREPARING", "LAUNCHING", "RUNNING"]);
    expect(statuses).not.toContain("NEEDS_STAFF");

    const enrolled = await prisma.clientEmailSequenceEnrollment.findMany({
      where: { sequenceId },
      select: { contact: { select: { email: true, isSuppressed: true } } },
    });
    expect(enrolled.map((row) => row.contact.email).sort()).toEqual([ADA, GRACE].sort());
    expect(enrolled.some((row) => row.contact.isSuppressed)).toBe(false);
    expect(
      await prisma.clientEmailSequenceEnrollment.count({ where: { sequenceId: HUMAN_SEQUENCE_ID } }),
    ).toBe(0);

    const planned = await prisma.clientEmailSequenceStepSend.findMany({
      where: { sequenceId },
      select: { status: true, contact: { select: { email: true } }, outboundEmailId: true },
    });
    const readyOrSent = planned.filter((row) => row.status === "READY" || row.outboundEmailId !== null);
    expect(readyOrSent.map((row) => row.contact.email)).toEqual([ADA]);
    const grace = planned.find((row) => row.contact.email === GRACE);
    expect(grace?.status).not.toBe("READY");
    expect(grace?.outboundEmailId).toBeNull();

    const queued = await prisma.outboundEmail.findMany({
      where: { clientId: CLIENT_ID, toEmail: ADA, status: "QUEUED" },
    });
    expect(queued).toHaveLength(1);

    const template = await prisma.clientEmailTemplate.findFirstOrThrow({
      where: { clientId: CLIENT_ID, category: "INTRODUCTION" },
    });
    expect(template.status).toBe("APPROVED");
    expect(template.systemApprovalKind).toBe("AI");
    const client = await prisma.client.findUniqueOrThrow({ where: { id: CLIENT_ID } });
    expect(client.autonomousSendEnabled).not.toBe(true);

    const events = await prisma.aiOutreachCampaignEvent.findMany({ where: { campaignId: CAMPAIGN_ID } });
    expect(events.map((event) => event.message).join("\n")).not.toMatch(/Review recipients|NO_READY_ROWS/);
    expect(ai.draft).toHaveBeenCalledOnce();
    expect(ai.review).toHaveBeenCalledOnce();

    const again = await tickAiCampaignsForClient(CLIENT_ID);
    expect(again.errors).toEqual([]);
    const stillRunning = await prisma.aiOutreachCampaign.findUniqueOrThrow({ where: { id: CAMPAIGN_ID } });
    expect(stillRunning.status).toBe("RUNNING");
    expect(stillRunning.staffAlert).toBeNull();
    expect(stillRunning.consecutiveFailures).toBe(0);
    expect(
      await prisma.clientEmailSequenceEnrollment.count({ where: { sequenceId: HUMAN_SEQUENCE_ID } }),
    ).toBe(0);
  });
});
