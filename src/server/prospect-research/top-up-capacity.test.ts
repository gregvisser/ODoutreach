import { beforeEach, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ value: [] as unknown[], where: null as unknown }));
const days = vi.hoisted(() => new Map<string, number>());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    clientMailboxIdentity: {
      findMany: async ({ where }: { where: unknown }) => {
        rows.where = where;
        return rows.value;
      },
    },
  },
}));
vi.mock("@/server/mailbox/client-sending-calendar", () => ({
  loadClientCalendarPlanningContext: async () => ({ window: {}, sendingDays: days }),
}));

import { loadSequenceMailboxDailyCaps } from "./top-up-capacity";

const connected = (id: string, dailySendCap: number) => ({
  id,
  dailySendCap,
  connectedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  workspaceRemovedAt: null,
});

beforeEach(() => {
  rows.value = [];
  days.clear();
  vi.unstubAllEnvs();
});

it("returns nothing when the client has no connected sending mailbox", async () => {
  await expect(loadSequenceMailboxDailyCaps("client-1", new Date())).resolves.toEqual([]);
  expect(rows.where).toMatchObject({ clientId: "client-1", isActive: true, connectionStatus: "CONNECTED", canSend: true, isSendingEnabled: true, workspaceRemovedAt: null });
});

it("uses each connected mailbox's warm-up aware daily cap", async () => {
  rows.value = [connected("a", 30), connected("b", 30)];
  days.set("a", 60);
  const caps = await loadSequenceMailboxDailyCaps("client-1", new Date("2026-10-03T08:00:00.000Z"));
  expect(caps).toHaveLength(2);
  // A mailbox that has never sent is held lower than, or equal to, a warmed one.
  expect(caps[1]).toBeLessThanOrEqual(caps[0]!);
  for (const cap of caps) expect(cap).toBeGreaterThan(0);
});
