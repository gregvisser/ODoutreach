import { z } from "zod";
import {
  ROCKETREACH_AUTO_TOP_UP_HORIZON_DAYS,
  ROCKETREACH_AUTO_TOP_UP_MAX_BATCH,
  ROCKETREACH_AUTO_TOP_UP_MIN_BATCH,
} from "@/lib/clients/rocketreach-import-cap";
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
  floorEnvInvalid: boolean;
};

export type RefillDecision =
  | { action: "skip"; reason: string }
  | { action: "refill"; lookupBudget: number };

export type ListPeopleNeed =
  | { action: "skip"; reason: string }
  | { action: "fill"; gap: number };

/**
 * Whether the list has run low. This is the trigger for a top-up; the size of
 * the top-up comes from {@link autoTopUpBatchSize}. It does not look at credits.
 */
export function listNeedsPeople(input: RefillDecisionInput): ListPeopleNeed {
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
  return { action: "fill", gap: input.lowWaterMark - input.readyNotEnrolled };
}

export type TopUpBatch =
  | { action: "skip"; reason: string }
  | { action: "fill"; batch: number; capacity: number };

/**
 * Size of one automatic top-up: what the sequence's connected mailboxes can
 * safely send over the horizon (warm-up aware daily caps), less the ready
 * contacts already waiting, clamped to 10-30. A per-top-up batch, never a
 * lifetime or monthly cap: the next top-up happens when the list runs low again.
 */
export function autoTopUpBatchSize(input: {
  mailboxDailyCaps: readonly number[];
  readyNotEnrolled: number;
  horizonDays?: number;
}): TopUpBatch {
  const caps = input.mailboxDailyCaps.filter((cap) => Number.isFinite(cap) && cap > 0);
  if (caps.length === 0) {
    return {
      action: "skip",
      reason: "No connected sending mailbox can send for this client, so the list was not topped up.",
    };
  }
  const horizon = input.horizonDays ?? ROCKETREACH_AUTO_TOP_UP_HORIZON_DAYS;
  const capacity = caps.reduce((sum, cap) => sum + Math.floor(cap), 0) * horizon;
  const ready = Math.max(0, Math.floor(input.readyNotEnrolled));
  if (ready >= capacity) {
    return {
      action: "skip",
      reason: `The list already holds ${String(ready)} ready contacts, enough for the next ${String(horizon)} days of sending (${String(capacity)}).`,
    };
  }
  const batch = Math.min(
    ROCKETREACH_AUTO_TOP_UP_MAX_BATCH,
    Math.max(ROCKETREACH_AUTO_TOP_UP_MIN_BATCH, capacity - ready),
  );
  return { action: "fill", batch, capacity };
}

/**
 * How many RocketReach lookups this top-up may make after Universe has added
 * what it can. There is no monthly cap. The daily safety budget and the
 * balance floor still apply.
 */
export function decideListRefill(input: {
  remainingBatch: number;
  balance: { ok: true; remaining: number | "unlimited" } | { ok: false; reason: string };
  balanceFloor: number;
  creditsReservedToday: number;
  maxCreditsPerDay: number;
}): RefillDecision {
  if (input.remainingBatch < 1) {
    return { action: "skip", reason: "Universe filled this top-up, so no RocketReach lookup was needed." };
  }
  if (!input.balance.ok) return { action: "skip", reason: input.balance.reason };
  if (input.balance.remaining !== "unlimited" && input.balance.remaining <= input.balanceFloor) {
    return {
      action: "skip",
      reason: `RocketReach balance ${String(input.balance.remaining)} is not above the floor of ${String(input.balanceFloor)}.`,
    };
  }
  const dayLeft = input.maxCreditsPerDay - input.creditsReservedToday;
  const lookupBudget = Math.min(
    ROCKETREACH_AUTO_TOP_UP_MAX_BATCH,
    input.remainingBatch,
    dayLeft,
    input.balance.remaining === "unlimited" ? ROCKETREACH_AUTO_TOP_UP_MAX_BATCH : input.balance.remaining - input.balanceFloor,
  );
  if (!Number.isSafeInteger(lookupBudget) || lookupBudget < 1) {
    return { action: "skip", reason: "Today's RocketReach safety budget for this sequence is already used." };
  }
  return { action: "refill", lookupBudget };
}

export const sequenceRefillRuleInputSchema = z
  .object({
    sequenceId: z.string().trim().min(1).max(200),
    planId: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
    lowWaterMark: z.number().int().min(1).max(500),
    /** Daily safety budget. At least one full top-up, so a batch is never cut short by it. */
    maxCreditsPerDay: z.number().int().min(ROCKETREACH_AUTO_TOP_UP_MAX_BATCH).max(200),
    balanceFloor: z.number().int().min(0).max(1_000_000),
    confirmationPhrase: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
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

/** Default daily safety budget: two full top-ups. */
export const DEFAULT_TOP_UP_DAILY_SAFETY_BUDGET = ROCKETREACH_AUTO_TOP_UP_MAX_BATCH * 2;

export type SequenceRefillRuleInput = z.infer<typeof sequenceRefillRuleInputSchema>;
