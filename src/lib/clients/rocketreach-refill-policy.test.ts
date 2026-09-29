import { describe, expect, it } from "vitest";
import {
  clientAllowsListRefill,
  decideListRefill,
  effectiveBalanceFloor,
  isRocketReachAutoRefillEnabled,
  sequenceRefillRuleInputSchema,
  type RefillDecisionInput,
} from "./rocketreach-refill-policy";

const ready = (partial: Partial<RefillDecisionInput> = {}): RefillDecisionInput => ({
  killSwitchOn: true,
  client: { status: "ACTIVE", deletedAt: null, autonomousSendEnabled: true },
  sequenceArchived: false,
  listArchived: false,
  planBelongsToClient: true,
  readyNotEnrolled: 2,
  lowWaterMark: 5,
  balance: { ok: true, remaining: 40 },
  balanceFloor: 10,
  creditsReservedToday: 0,
  creditsReservedThisMonth: 0,
  maxCreditsPerRun: 4,
  maxCreditsPerDay: 10,
  maxCreditsPerMonth: 20,
  floorEnvInvalid: false,
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

  it("allows a refill only for an active Machine-mode client under the threshold", () => {
    expect(clientAllowsListRefill({ status: "ACTIVE", deletedAt: null, autonomousSendEnabled: null }).ok).toBe(false);
    expect(clientAllowsListRefill({ status: "PAUSED", deletedAt: null, autonomousSendEnabled: true }).ok).toBe(false);
    expect(decideListRefill(ready())).toEqual({ action: "refill", lookupBudget: 3 });
    expect(decideListRefill(ready({ killSwitchOn: false })).action).toBe("skip");
    expect(decideListRefill(ready({ readyNotEnrolled: 5 })).action).toBe("skip");
  });

  it("stops at the balance floor and at the day, month, and per-run budgets", () => {
    expect(decideListRefill(ready({ balance: { ok: true, remaining: 10 } })).action).toBe("skip");
    expect(decideListRefill(ready({ balance: { ok: false, reason: "unavailable" } })).action).toBe("skip");
    const dayLeft = decideListRefill(ready({ creditsReservedToday: 9 }));
    expect(dayLeft).toEqual({ action: "refill", lookupBudget: 1 });
    expect(decideListRefill(ready({ creditsReservedThisMonth: 20 })).action).toBe("skip");
    const perRun = decideListRefill(ready({ maxCreditsPerRun: 1, readyNotEnrolled: 0, lowWaterMark: 20 }));
    expect(perRun).toEqual({ action: "refill", lookupBudget: 1 });
    expect(effectiveBalanceFloor(10, 25)).toBe(25);
    expect(effectiveBalanceFloor(40, 25)).toBe(40);
  });

  it("rejects a toggle that is missing the confirmation phrase", () => {
    const parsed = sequenceRefillRuleInputSchema.safeParse({
      sequenceId: "seq",
      planId: "plan",
      enabled: true,
      lowWaterMark: 5,
      maxCreditsPerRun: 2,
      maxCreditsPerDay: 4,
      maxCreditsPerMonth: 8,
      balanceFloor: 10,
      confirmationPhrase: "yes",
    });
    expect(parsed.success).toBe(false);
  });
});
