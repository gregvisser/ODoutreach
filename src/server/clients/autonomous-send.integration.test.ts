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

it("refuses machine activation without changing consent or writing an audit", async () => {
  expect(await setClientAutonomousSend({ clientId: "client", staffUserId: "staff", setting: "MACHINE" })).toMatchObject({ ok: false });
  expect((await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).autonomousSendEnabled).toBe(false);
  expect(await prisma.auditLog.count()).toBe(0);
  expect(await prisma.outboundEmail.count()).toBe(0);
});

it("still lets staff turn existing machine consent off with attribution", async () => {
  await prisma.client.update({ where: { id: "client" }, data: { autonomousSendEnabled: true } });
  expect(await setClientAutonomousSend({ clientId: "client", staffUserId: "staff", setting: "HUMAN" })).toMatchObject({ ok: true });
  expect((await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).autonomousSendEnabled).toBe(false);
  expect(await prisma.auditLog.count()).toBe(1);
  expect(await prisma.outboundEmail.count()).toBe(0);
});
