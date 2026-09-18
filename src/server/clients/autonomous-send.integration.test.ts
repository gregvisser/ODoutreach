import { afterAll, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { setClientAutonomousSend } from "./autonomous-send";

beforeEach(async () => {
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: { id: "staff", entraObjectId: "staff", email: "staff@example.test", role: "OPERATOR", isActive: true } });
  await prisma.client.create({ data: { id: "client", name: "Synthetic", slug: "synthetic", autonomousSendEnabled: false } });
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

it("records machine activation with attribution and does not queue mail", async () => {
  expect(await setClientAutonomousSend({ clientId: "client", staffUserId: "staff", setting: "MACHINE" })).toMatchObject({
    ok: true,
    attribution: { enabled: true, setByName: "staff@example.test" },
  });
  expect((await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).autonomousSendEnabled).toBe(true);
  expect(await prisma.auditLog.findFirst({ where: { clientId: "client" } })).toMatchObject({
    staffUserId: "staff",
    metadata: { kind: "autonomous_send_set", previousEnabled: false, enabled: true, setting: "MACHINE" },
  });
  expect(await prisma.outboundEmail.count()).toBe(0);
});

it("still lets staff turn existing machine consent off with attribution", async () => {
  await prisma.client.update({ where: { id: "client" }, data: { autonomousSendEnabled: true } });
  expect(await setClientAutonomousSend({ clientId: "client", staffUserId: "staff", setting: "HUMAN" })).toMatchObject({ ok: true });
  expect((await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).autonomousSendEnabled).toBe(false);
  expect(await prisma.auditLog.count()).toBe(1);
  expect(await prisma.outboundEmail.count()).toBe(0);
});
