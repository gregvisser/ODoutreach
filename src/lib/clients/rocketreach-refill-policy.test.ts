import { describe, expect, it } from "vitest";
import {
  autoTopUpBatchSize,
  clientAllowsListRefill,
  decideListRefill,
  effectiveBalanceFloor,
  listNeedsPeople,
  isRocketReachAutoRefillEnabled,
  sequenceRefillRuleInputSchema,
  type RefillDecisionInput,
} from "./rocketreach-refill-policy";
import { rocketReachImportPageCeiling } from "./rocketreach-import-cap";

const gate = (partial: Partial<RefillDecisionInput> = {}): RefillDecisionInput => ({
  killSwitchOn: true,
  client: { status: "ACTIVE", deletedAt: null, autonomousSendEnabled: true },
  sequenceArchived: false,
  listArchived: false,
  planBelongsToClient: true,
  readyNotEnrolled: 2,
  lowWaterMark: 5,
  floorEnvInvalid: false,
  ...partial,
});

const spend = (partial: Partial<Parameters<typeof decideListRefill>[0]> = {}) => ({
  remainingBatch: 20,
  balance: { ok: true as const, remaining: 400 as number | "unlimited" },
  balanceFloor: 10,
  creditsReservedToday: 0,
  maxCreditsPerDay: 60,
  ...partial,
});

describe("RocketReach automatic list top-up policy", () => {
  it("keeps the kill switch off unless the env is an explicit on value", () => {
    expect(isRocketReachAutoRefillEnabled(undefined)).toBe(false);
    expect(isRocketReachAutoRefillEnabled("")).toBe(false);
    expect(isRocketReachAutoRefillEnabled("off")).toBe(false);
    expect(isRocketReachAutoRefillEnabled("false")).toBe(false);
    expect(isRocketReachAutoRefillEnabled("true")).toBe(true);
    expect(isRocketReachAutoRefillEnabled(" ON ")).toBe(true);
  });

  it("triggers a top-up only for an active Machine-mode client whose list has run low", () => {
    expect(clientAllowsListRefill({ status: "ACTIVE", deletedAt: null, autonomousSendEnabled: null }).ok).toBe(false);
    expect(clientAllowsListRefill({ status: "PAUSED", deletedAt: null, autonomousSendEnabled: true }).ok).toBe(false);
    expect(listNeedsPeople(gate())).toEqual({ action: "fill", gap: 3 });
    expect(listNeedsPeople(gate({ killSwitchOn: false })).action).toBe("skip");
    expect(listNeedsPeople(gate({ readyNotEnrolled: 5 })).action).toBe("skip");
  });

  it("sizes each batch to safe mailbox capacity over three days, clamped to 10-30", () => {
    // One warm-up mailbox at 5/day: 15 over 3 days, minus 2 ready = 13.
    expect(autoTopUpBatchSize({ mailboxDailyCaps: [5], readyNotEnrolled: 2 })).toEqual({ action: "fill", batch: 13, capacity: 15 });
    // Tiny capacity still pulls the minimum batch of 10.
    expect(autoTopUpBatchSize({ mailboxDailyCaps: [2], readyNotEnrolled: 0 })).toEqual({ action: "fill", batch: 10, capacity: 6 });
    // Three warmed mailboxes at 30/day: 270 over 3 days, capped at 30.
    expect(autoTopUpBatchSize({ mailboxDailyCaps: [30, 30, 30], readyNotEnrolled: 4 })).toEqual({ action: "fill", batch: 30, capacity: 270 });
  });

  it("does not top up without a connected mailbox, or when the list already covers the horizon", () => {
    expect(autoTopUpBatchSize({ mailboxDailyCaps: [], readyNotEnrolled: 0 }).action).toBe("skip");
    expect(autoTopUpBatchSize({ mailboxDailyCaps: [0], readyNotEnrolled: 0 }).action).toBe("skip");
    expect(autoTopUpBatchSize({ mailboxDailyCaps: [5], readyNotEnrolled: 15 }).action).toBe("skip");
  });

  it("looks up only what Universe left of the batch, with no monthly cap", () => {
    expect(decideListRefill(spend())).toEqual({ action: "refill", lookupBudget: 20 });
    expect(decideListRefill(spend({ remainingBatch: 30 }))).toEqual({ action: "refill", lookupBudget: 30 });
    expect(decideListRefill(spend({ remainingBatch: 0 })).action).toBe("skip");
    expect(decideListRefill(spend({ remainingBatch: 45 }))).toEqual({ action: "refill", lookupBudget: 30 });
  });

  it("still stops at the balance floor and the daily safety budget", () => {
    expect(decideListRefill(spend({ balance: { ok: true, remaining: 10 } })).action).toBe("skip");
    expect(decideListRefill(spend({ balance: { ok: false, reason: "unavailable" } })).action).toBe("skip");
    expect(decideListRefill(spend({ balance: { ok: true, remaining: 15 } }))).toEqual({ action: "refill", lookupBudget: 5 });
    expect(decideListRefill(spend({ creditsReservedToday: 55 }))).toEqual({ action: "refill", lookupBudget: 5 });
    expect(decideListRefill(spend({ creditsReservedToday: 60 })).action).toBe("skip");
    expect(effectiveBalanceFloor(10, 25)).toBe(25);
    expect(effectiveBalanceFloor(40, 25)).toBe(40);
  });

  it("keeps manual imports at 10 and lets only automatic top-up reach 30", () => {
    expect(rocketReachImportPageCeiling(undefined)).toBe(10);
    expect(rocketReachImportPageCeiling(25)).toBe(25);
    expect(rocketReachImportPageCeiling(500)).toBe(30);
  });

  it("rejects a toggle that is missing the confirmation phrase, and a daily budget below one batch", () => {
    const base = {
      sequenceId: "seq",
      planId: "plan",
      enabled: true,
      lowWaterMark: 5,
      maxCreditsPerDay: 60,
      balanceFloor: 10,
      confirmationPhrase: "ENABLE LIST TOP-UP",
    };
    expect(sequenceRefillRuleInputSchema.safeParse(base).success).toBe(true);
    expect(sequenceRefillRuleInputSchema.safeParse({ ...base, confirmationPhrase: "yes" }).success).toBe(false);
    expect(sequenceRefillRuleInputSchema.safeParse({ ...base, maxCreditsPerDay: 20 }).success).toBe(false);
    expect(sequenceRefillRuleInputSchema.safeParse({ ...base, maxCreditsPerMonth: 100 }).success).toBe(false);
  });
});
