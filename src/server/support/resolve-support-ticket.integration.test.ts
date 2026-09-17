import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { resolveSupportTicketWithNotification } from "./resolve-support-ticket";

describe("resolveSupportTicketWithNotification (PostgreSQL)", () => {
  beforeEach(async () => {
    await resetIntegrationDatabase();
    await prisma.staffUser.create({
      data: { id: "reporter", entraObjectId: "reporter-entra", email: "reporter@example.test", role: "OPERATOR", isActive: true },
    });
    await prisma.supportTicket.create({
      data: {
        id: "ticket-1",
        title: "Unable to send sequence",
        description: "The sequence could not be launched.",
        reporterEmail: "reporter@example.test",
        createdByStaffUserId: "reporter",
      },
    });
  });

  it("commits the close and exactly one durable outbox row", async () => {
    await expect(resolveSupportTicketWithNotification({ ticketId: "ticket-1", resolutionNote: "Added the missing unsubscribe footer." })).resolves.toMatchObject({ resolutionVersion: 1 });
    await expect(prisma.supportTicket.findUniqueOrThrow({ where: { id: "ticket-1" } })).resolves.toMatchObject({ status: "RESOLVED", resolutionNote: "Added the missing unsubscribe footer." });
    await expect(prisma.supportTicketNotification.findMany({ where: { ticketId: "ticket-1" } })).resolves.toHaveLength(1);
  });

  it("allows only one of two concurrent closes to commit its outbox row", async () => {
    const results = await Promise.allSettled([
      resolveSupportTicketWithNotification({ ticketId: "ticket-1", resolutionNote: "Applied the first safe fix." }),
      resolveSupportTicketWithNotification({ ticketId: "ticket-1", resolutionNote: "Applied the second safe fix." }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(prisma.supportTicketNotification.count({ where: { ticketId: "ticket-1" } })).resolves.toBe(1);
    await expect(prisma.supportTicketNotification.count({ where: { ticketId: "ticket-1", resolutionVersion: 1 } })).resolves.toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});
