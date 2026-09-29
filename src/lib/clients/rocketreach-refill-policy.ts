import { z } from "zod";
import { ROCKETREACH_MAX_IMPORT } from "@/lib/clients/rocketreach-import-cap";
import {
  isRocketReachTopUpConfirmationValid,
} from "@/lib/clients/rocketreach-import-safety";

/** Global kill switch. Unset, empty, and every value other than the on-list means off. */
export function isRocketReachAutoRefillEnabled(envValue: string | undefined): boolean {
  const value = (envValue ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function parseOptionalCreditFloor(envValue: string | undefined): number | "invalid" | null {
  const raw = envValue?.trim() ?? "";
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return "invalid";
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return "invalid";
  return parsed;
}

/** The env floor can only raise the rule floor. It cannot lower a staff-set floor. */
export function effectiveBalanceFloor(ruleFloor: number, envFloor: number | null): number {
  if (envFloor === null) return ruleFloor;
  return Math.max(ruleFloor, envFloor);
}

export type RefillClientGate = {
  status: string;
  deletedAt: Date | null;
  autonomousSendEnabled: boolean | null;
};

export function clientAllowsListRefill(
  client: RefillClientGate,
): { ok: true } | { ok: false; reason: string } {
  if (client.deletedAt) return { ok: false, reason: "This client workspace is deleted." };
  if (client.status !== "ACTIVE") return { ok: false, reason: "This client is not Active." };
  if (client.autonomousSendEnabled !== true) {
    return { ok: false, reason: "This client is not on Machine sending." };
  }
  return { ok: true };
}

export type RefillDecisionInput = {
  killSwitchOn: boolean;
  client: RefillClientGate;
  sequenceArchived: boolean;
  listArchived: boolean;
  planBelongsToClient: boolean;
  readyNotEnrolled: number;
  lowWaterMark: number;
  balance: { ok: true; remaining: number | "unlimited" } | { ok: false; reason: string };
  balanceFloor: number;
  creditsReservedToday: number;
  creditsReservedThisMonth: number;
  maxCreditsPerRun: number;
  maxCreditsPerDay: number;
  maxCreditsPerMonth: number;
  floorEnvInvalid: boolean;
};

export type RefillDecision =
  | { action: "skip"; reason: string }
  | { action: "refill"; lookupBudget: number };

export function decideListRefill(input: RefillDecisionInput): RefillDecision {
  if (!input.killSwitchOn) {
    return { action: "skip", reason: "ROCKETREACH_AUTO_REFILL is off." };
  }
  if (input.floorEnvInvalid) {
    return { action: "skip", reason: "ROCKETREACH_MIN_CREDIT_FLOOR is set but is not a whole number." };
  }
  const client = clientAllowsListRefill(input.client);
  if (!client.ok) return { action: "skip", reason: client.reason };
  if (input.sequenceArchived) return { action: "skip", reason: "This sequence is archived." };
  if (input.listArchived) return { action: "skip", reason: "This sequence's list is archived." };
  if (!input.planBelongsToClient) {
    return { action: "skip", reason: "The research plan does not belong to this client." };
  }
  if (input.readyNotEnrolled >= input.lowWaterMark) {
    return {
      action: "skip",
      reason: `The list already has ${String(input.readyNotEnrolled)} ready contacts who are not enrolled. The threshold is ${String(input.lowWaterMark)}.`,
    };
  }
  if (!input.balance.ok) return { action: "skip", reason: input.balance.reason };
  if (input.balance.remaining !== "unlimited" && input.balance.remaining <= input.balanceFloor) {
    return {
      action: "skip",
      reason: `RocketReach balance ${String(input.balance.remaining)} is not above the floor of ${String(input.balanceFloor)}.`,
    };
  }
  const dayLeft = input.maxCreditsPerDay - input.creditsReservedToday;
  const monthLeft = input.maxCreditsPerMonth - input.creditsReservedThisMonth;
  const gap = input.lowWaterMark - input.readyNotEnrolled;
  const lookupBudget = Math.min(
    ROCKETREACH_MAX_IMPORT,
    input.maxCreditsPerRun,
    dayLeft,
    monthLeft,
    gap,
    input.balance.remaining === "unlimited" ? ROCKETREACH_MAX_IMPORT : input.balance.remaining - input.balanceFloor,
  );
  if (!Number.isSafeInteger(lookupBudget) || lookupBudget < 1) {
    return { action: "skip", reason: "The credit budget for this run is already used." };
  }
  return { action: "refill", lookupBudget };
}

export const sequenceRefillRuleInputSchema = z
  .object({
    sequenceId: z.string().trim().min(1).max(200),
    planId: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
    lowWaterMark: z.number().int().min(1).max(500),
    maxCreditsPerRun: z.number().int().min(1).max(ROCKETREACH_MAX_IMPORT),
    maxCreditsPerDay: z.number().int().min(1).max(200),
    maxCreditsPerMonth: z.number().int().min(1).max(2000),
    balanceFloor: z.number().int().min(0).max(1_000_000),
    confirmationPhrase: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.maxCreditsPerDay < value.maxCreditsPerRun) {
      ctx.addIssue({
        code: "custom",
        path: ["maxCreditsPerDay"],
        message: "The daily credit budget must be at least the per-run budget.",
      });
    }
    if (value.maxCreditsPerMonth < value.maxCreditsPerDay) {
      ctx.addIssue({
        code: "custom",
        path: ["maxCreditsPerMonth"],
        message: "The monthly credit budget must be at least the daily budget.",
      });
    }
    if (!isRocketReachTopUpConfirmationValid(value.enabled, value.confirmationPhrase)) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmationPhrase"],
        message: value.enabled
          ? "Type ENABLE LIST TOP-UP to turn automatic list top-up on."
          : "Type DISABLE LIST TOP-UP to turn automatic list top-up off.",
      });
    }
  });

export type SequenceRefillRuleInput = z.infer<typeof sequenceRefillRuleInputSchema>;
