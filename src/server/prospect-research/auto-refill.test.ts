import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { sequenceListRefillRule: { findMany: db.findMany } } }));
vi.mock("@/server/integrations/rocketreach/account", () => ({ loadRocketReachCreditSnapshot: vi.fn() }));
vi.mock("@/server/integrations/rocketreach/person-import", () => ({ searchRocketReachIdentities: vi.fn() }));
vi.mock("@/server/prospect-research/execute-plan", () => ({ executeSavedResearchPlan: vi.fn() }));
vi.mock("@/server/prospect-research/universe-harvest", () => ({
  applyUniverseHarvest: vi.fn(async () => ({ ok: true, added: 0, created: 0, attached: 0, matches: [], skipped: {} })),
  collectUniverseHarvest: vi.fn(async () => ({ ok: true, matches: [], skipped: {} })),
  UNIVERSE_HARVEST_BATCH: 50,
}));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: vi.fn() }));

import { runDueRocketReachListRefills } from "./auto-refill";

afterEach(() => {
  vi.unstubAllEnvs();
  db.findMany.mockReset();
});

it("does no database or provider work when the kill switch is off", async () => {
  vi.stubEnv("ROCKETREACH_AUTO_REFILL", "off");
  await expect(runDueRocketReachListRefills()).resolves.toMatchObject({ killSwitch: "off", processed: 0, failed: 0 });
  expect(db.findMany).not.toHaveBeenCalled();
});

it("stays off when the env is missing", async () => {
  vi.stubEnv("ROCKETREACH_AUTO_REFILL", "");
  await expect(runDueRocketReachListRefills()).resolves.toMatchObject({ killSwitch: "off" });
  expect(db.findMany).not.toHaveBeenCalled();
});

it("does not enrol contacts or send email from the top-up module", () => {
  const source = readFileSync(path.join(process.cwd(), "src/server/prospect-research/auto-refill.ts"), "utf8");
  expect(source).not.toMatch(/enrollSequenceContacts|processOutboundSendQueue|sendSequenceStep|advanceDueSequenceFollowUps/);
});
