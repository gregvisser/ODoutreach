import "dotenv/config";

import { extractDomainFromEmail, normalizeEmail } from "../src/lib/normalize";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL required for seed");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const seedEntraOid =
    process.env.SEED_ENTRA_OBJECT_ID ?? "00000000-0000-0000-0000-000000000001";

  const rawStaffEmail = process.env.SEED_STAFF_EMAIL?.trim();
  const seedStaffEmail = normalizeEmail(
    rawStaffEmail && rawStaffEmail.length > 0
      ? rawStaffEmail
      : "staff@opensdoors.example",
  );

  const staff = await prisma.staffUser.upsert({
    where: { entraObjectId: seedEntraOid },
    create: {
      entraObjectId: seedEntraOid,
      email: seedStaffEmail,
      displayName: "Demo Staff",
      role: "ADMIN",
    },
    update: {
      email: seedStaffEmail,
      displayName: "Demo Staff",
    },
  });

  const clientsData = [
    {
      name: "Northwind Labs",
      slug: "northwind-labs",
      industry: "B2B SaaS",
      website: "https://northwind.example",
    },
    {
      name: "Contoso Health",
      slug: "contoso-health",
      industry: "Healthcare IT",
      website: "https://contoso-health.example",
    },
    {
      name: "Fabrikam Retail",
      slug: "fabrikam-retail",
      industry: "Retail",
      website: "https://fabrikam.example",
    },
  ];

  for (const c of clientsData) {
    const client = await prisma.client.upsert({
      where: { slug: c.slug },
      create: {
        ...c,
        status: "ACTIVE",
      },
      update: { name: c.name, industry: c.industry, website: c.website },
    });

    await prisma.clientMembership.upsert({
      where: {
        staffUserId_clientId: { staffUserId: staff.id, clientId: client.id },
      },
      create: {
        staffUserId: staff.id,
        clientId: client.id,
        role: "LEAD",
      },
      update: {},
    });

    await prisma.clientOnboarding.upsert({
      where: { clientId: client.id },
      create: {
        clientId: client.id,
        currentStep: 4,
        completedSteps: [1, 2, 3, 4],
        completedAt: new Date(),
        formData: {
          senderName: "OpensDoors Team",
          dailyCap: 120,
        },
      },
      update: {},
    });

    const emailSourceId = `seed-email-src-${c.slug}`;
    const domainSourceId = `seed-domain-src-${c.slug}`;

    await prisma.suppressionSource.upsert({
      where: { id: emailSourceId },
      create: {
        id: emailSourceId,
        clientId: client.id,
        kind: "EMAIL",
        spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        sheetRange: "Sheet1!A:A",
        label: "Email blocklist",
        syncStatus: "SUCCESS",
        lastSyncedAt: new Date(),
        googleConnectionRef: "stub-connection-ref",
      },
      update: {
        syncStatus: "SUCCESS",
        lastSyncedAt: new Date(),
      },
    });

    await prisma.suppressionSource.upsert({
      where: { id: domainSourceId },
      create: {
        id: domainSourceId,
        clientId: client.id,
        kind: "DOMAIN",
        spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        sheetRange: "Domains!A:A",
        label: "Domain blocklist",
        syncStatus: "IDLE",
        googleConnectionRef: "stub-connection-ref",
      },
      update: {},
    });

    await prisma.suppressedEmail.upsert({
      where: {
        clientId_email: {
          clientId: client.id,
          email: `blocked-${c.slug}@competitor.com`,
        },
      },
      create: {
        clientId: client.id,
        email: `blocked-${c.slug}@competitor.com`,
        sourceId: emailSourceId,
      },
      update: {},
    });

    await prisma.suppressedEmail.upsert({
      where: {
        clientId_email: {
          clientId: client.id,
          email: `unsubscribe@${c.slug}.invalid`,
        },
      },
      create: {
        clientId: client.id,
        email: `unsubscribe@${c.slug}.invalid`,
        sourceId: emailSourceId,
      },
      update: {},
    });

    await prisma.suppressedDomain.upsert({
      where: {
        clientId_domain: { clientId: client.id, domain: "competitor.com" },
      },
      create: {
        clientId: client.id,
        domain: "competitor.com",
        sourceId: domainSourceId,
      },
      update: {},
    });

    await prisma.suppressedDomain.upsert({
      where: {
        clientId_domain: { clientId: client.id, domain: "spam.example" },
      },
      create: {
        clientId: client.id,
        domain: "spam.example",
        sourceId: domainSourceId,
      },
      update: {},
    });

    const batchId = `seed-batch-${c.slug}`;
    await prisma.contactImportBatch.upsert({
      where: { id: batchId },
      create: {
        id: batchId,
        clientId: client.id,
        fileName: "prospects-q1.csv",
        rowCount: 3,
        status: "COMPLETED",
      },
      update: { rowCount: 3, status: "COMPLETED" },
    });

    const contacts = [
      {
        email: `alex@${c.slug}.prospect.com`,
        firstName: "Alex",
        lastName: "Rivera",
        fullName: "Alex Rivera",
        company: `${client.name} Prospect`,
        title: "VP Ops",
        source: "CSV_IMPORT" as const,
        isSuppressed: false,
      },
      {
        email: `jamie@${c.slug}.prospect.com`,
        firstName: "Jamie",
        lastName: "Chen",
        fullName: "Jamie Chen",
        company: "Pacific Traders",
        title: "Director",
        source: "ROCKETREACH" as const,
        isSuppressed: true,
      },
      {
        email: `sam@${c.slug}.prospect.com`,
        firstName: "Sam",
        lastName: "Taylor",
        fullName: "Sam Taylor",
        company: "Urban Goods",
        title: "Head of IT",
        source: "MANUAL" as const,
        isSuppressed: false,
      },
    ];

    for (const co of contacts) {
      const emailDomain = extractDomainFromEmail(co.email);
      const contact = await prisma.contact.upsert({
        where: {
          clientId_email: { clientId: client.id, email: co.email },
        },
        create: {
          clientId: client.id,
          ...co,
          emailDomain,
          importBatchId: batchId,
        },
        update: {
          firstName: co.firstName,
          lastName: co.lastName,
          fullName: co.fullName,
          emailDomain,
          isSuppressed: co.isSuppressed,
        },
      });

      if (co.source === "ROCKETREACH") {
        await prisma.rocketReachEnrichment.upsert({
          where: { contactId: contact.id },
          create: {
            clientId: client.id,
            contactId: contact.id,
            externalId: `rr-${contact.id}`,
            status: "FETCHED",
            rawPayload: { stub: true },
            fetchedAt: new Date(),
          },
          update: { status: "FETCHED" },
        });
      }
    }

    const campaignId = `seed-campaign-${c.slug}`;
    await prisma.campaign.upsert({
      where: { id: campaignId },
      create: {
        id: campaignId,
        clientId: client.id,
        name: `Q2 outbound · ${client.name}`,
        status: "ACTIVE",
        description: "Cold intro sequence — operations tracking only",
        startsAt: new Date(),
      },
      update: { status: "ACTIVE" },
    });

    const contactRows = await prisma.contact.findMany({
      where: { clientId: client.id },
      take: 2,
    });

    let firstOutboundId: string | null = null;
    for (const contact of contactRows) {
      const oid = `seed-out-${c.slug}-${contact.email}`;
      const toDomain = extractDomainFromEmail(contact.email);
      const providerMessageId = `mock-seed-${oid}`;
      await prisma.outboundEmail.upsert({
        where: { id: oid },
        create: {
          id: oid,
          clientId: client.id,
          campaignId,
          contactId: contact.id,
          staffUserId: staff.id,
          toEmail: contact.email,
          toDomain,
          fromAddress: `hello@${c.slug}.opensdoors.local`,
          subject: `Quick idea for ${contact.company ?? "your team"}`,
          bodySnapshot: "Seed outbound body — demo only.",
          status: "SENT",
          providerName: "mock",
          providerMessageId,
          sentAt: new Date(Date.now() - 86400000 * Math.random()),
        },
        update: {},
      });
      if (!firstOutboundId) firstOutboundId = oid;
    }

    await prisma.inboundReply.upsert({
      where: { id: `seed-reply-${c.slug}` },
      create: {
        id: `seed-reply-${c.slug}`,
        clientId: client.id,
        contactId: contactRows[0]?.id,
        linkedOutboundEmailId: firstOutboundId,
        fromEmail: contactRows[0]?.email ?? "reply@example.com",
        subject: "Re: Quick idea",
        snippet: "Thanks — can we book 20 minutes Thursday?",
        receivedAt: new Date(Date.now() - 3600000 * 5),
        ingestionSource: "seed",
        matchMethod: "BY_CONTACT_EMAIL",
        inReplyToProviderId: firstOutboundId
          ? `mock-seed-${firstOutboundId}`
          : undefined,
      },
      update: {},
    });

    for (let d = 0; d < 14; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);
      const emailsSent = 5 + Math.floor(Math.random() * 12);
      const repliesReceived = Math.floor(emailsSent * (0.08 + Math.random() * 0.1));
      await prisma.reportingDailySnapshot.upsert({
        where: {
          clientId_date: { clientId: client.id, date },
        },
        create: {
          clientId: client.id,
          date,
          emailsSent,
          repliesReceived,
          uniqueContacts: emailsSent,
          campaignsActive: 1,
          replyRate: repliesReceived / Math.max(emailsSent, 1),
        },
        update: {
          emailsSent,
          repliesReceived,
          replyRate: repliesReceived / Math.max(emailsSent, 1),
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      action: "CREATE",
      entityType: "seed",
      entityId: "demo",
      metadata: { message: "Database seeded" },
    },
  });

  console.log("Seed complete. Demo staff Entra object id:", seedEntraOid);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
