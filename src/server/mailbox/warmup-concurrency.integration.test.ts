import { beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { queueControlledPilotBatch } from "./controlled-pilot-send";
import { CONTROLLED_PILOT_CONFIRMATION_PHRASE } from "@/lib/controlled-pilot-constants";
import type { StaffUser } from "@/generated/prisma/client";

const barrier = vi.hoisted(() => ({ arrivals:0, release: (()=>{}) as ()=>void, ready: Promise.resolve() }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: async()=>{} }));
vi.mock("@/server/email/outbound/trigger-queue", () => ({ triggerOutboundQueueDrain: vi.fn() }));
vi.mock("@/server/outreach/suppression-guard", () => ({ evaluateSuppression: async()=>({ suppressed:false }) }));
vi.mock("@/server/mailbox/mailbox-send-composition", () => ({ prepareMailboxSendCompliance:()=>({ kind:"mailto", finalBody:"Synthetic test only" }), mailboxComplianceMetadata:()=>({}) }));
vi.mock("./sending-policy", async original => {
  const actual = await original<typeof import("./sending-policy")>();
  return { ...actual, countBookedSendSlotsInUtcWindow: async (...args: Parameters<typeof actual.countBookedSendSlotsInUtcWindow>) => {
    const booked = await actual.countBookedSendSlotsInUtcWindow(...args);
    // Both real planners read the same four bookings before either reserves.
    if (barrier.arrivals < 2) {
      barrier.arrivals++;
      if (barrier.arrivals === 2) barrier.release();
      await barrier.ready;
    }
    return booked;
  } };
});

beforeEach(async()=>{
  vi.stubGlobal("fetch", vi.fn(()=>{ throw Error("NETWORK BLOCKED"); }));
  vi.stubEnv("MAILBOX_WARMUP_RAMP", "on");
  vi.stubEnv("MAILBOX_SEND_PACING", "off");
  vi.stubEnv("GOVERNED_TEST_EMAIL_DOMAINS", "example.test");
  barrier.arrivals=0; barrier.ready=new Promise<void>(resolve=>{barrier.release=resolve;});
  await resetIntegrationDatabase();
  await prisma.client.create({ data:{ id:"warmup-client", name:"Synthetic warmup", slug:"synthetic-warmup" } });
  await prisma.staffUser.create({ data:{ id:"warmup-staff", entraObjectId:"synthetic-warmup-entra", email:"staff@example.test", displayName:"Synthetic staff", isActive:true } });
  await prisma.clientMailboxIdentity.create({ data:{ id:"warmup-mailbox", clientId:"warmup-client", provider:"GOOGLE", email:"sender@example.test", emailNormalized:"sender@example.test", connectionStatus:"CONNECTED", canSend:true, isSendingEnabled:true, dailySendCap:30 } });
  await prisma.mailboxSendReservation.createMany({ data:Array.from({length:4},(_,n)=>({ clientId:"warmup-client", mailboxIdentityId:"warmup-mailbox", idempotencyKey:"existing-"+n, windowKey:new Date().toISOString().slice(0,10), status:"RESERVED" as const })) });
});
afterEach(()=>{ expect(fetch).not.toHaveBeenCalled(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async()=>{await prisma.$disconnect();await closeIntegrationPool();});

it.each([["on",1,5],["off",2,6]] as const)("respects warm-up=%s when two pilots compete for allowance", async(flag, queued, booked)=>{
  vi.stubEnv("MAILBOX_WARMUP_RAMP",flag);
  const staff=await prisma.staffUser.findUniqueOrThrow({where:{id:"warmup-staff"}});
  const input={ staff:staff as StaffUser, clientId:"warmup-client", confirmationPhrase:CONTROLLED_PILOT_CONFIRMATION_PHRASE, subject:"Synthetic warmup test", bodyText:"No real mail" };
  const results=await Promise.all([
    queueControlledPilotBatch({...input,recipientLines:"first@example.test"}),
    queueControlledPilotBatch({...input,recipientLines:"second@example.test"}),
  ]);
  expect(barrier.arrivals).toBe(2);
  expect(results.reduce((n,result)=>n+(result.ok?result.queued:0),0)).toBe(queued);
  expect(await prisma.mailboxSendReservation.count({where:{status:"RESERVED"}})).toBe(booked);
  expect(await prisma.outboundEmail.count({where:{status:"QUEUED"}})).toBe(queued);
});

it("plans against the local bucket and completed local warm-up days across UTC midnight", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-09T00:10Z"));
  await prisma.clientSendingCalendar.create({ data: { clientId: "warmup-client", timeZone: "America/Los_Angeles", weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1080, previousDayEndsAt: new Date("2026-09-01T00:00Z"), effectiveAt: new Date("2026-09-01T07:00Z"), createdByStaffUserId: "warmup-staff" } });
  await prisma.mailboxSendReservation.updateMany({ data: { windowKey: "2026-09-08T07:00:00.000Z" } });
  // Five UTC dates, but only four completed Los Angeles sending days.
  const dates = ["2026-09-02T12:00Z", "2026-09-03T12:00Z", "2026-09-04T12:00Z", "2026-09-05T23:50Z", "2026-09-06T00:10Z"];
  await prisma.outboundEmail.createMany({ data: dates.map((sentAt, n) => ({ id: `local-history-${n}`, clientId: "warmup-client", mailboxIdentityId: "warmup-mailbox", toEmail: "history@example.test", status: "SENT" as const, sentAt: new Date(sentAt) })) });
  const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: "warmup-staff" } });
  const input = { staff, clientId: "warmup-client", confirmationPhrase: CONTROLLED_PILOT_CONFIRMATION_PHRASE, subject: "Synthetic local day", bodyText: "No real email" };
  const results = await Promise.all([
    queueControlledPilotBatch({ ...input, recipientLines: "first@example.test" }),
    queueControlledPilotBatch({ ...input, recipientLines: "second@example.test" }),
  ]);
  expect(results.reduce((sum, result) => sum + (result.ok ? result.queued : 0), 0)).toBe(1);
  expect(await prisma.mailboxSendReservation.count({ where: { windowKey: "2026-09-08T07:00:00.000Z" } })).toBe(5);
  expect(await prisma.mailboxSendReservation.count({ where: { windowKey: "2026-09-09" } })).toBe(0);
});

