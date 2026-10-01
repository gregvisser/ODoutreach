/**
 * Organisation feature ceiling. The environment is the emergency brake:
 * off for everyone, regardless of the organisation. The organisation flag
 * must also be on. Missing flags resolve to on, which is OpensDoors today.
 */

import {
  resolveOrganisationFeatureFlags,
  type OrganisationFeatureFlags,
  type OrganisationFeatureKey,
} from "./organisation";

export function organisationFeaturePermits(
  organisation: { status: string; featureFlags: unknown } | null,
  key: OrganisationFeatureKey,
  envEnabled: boolean,
): boolean {
  if (!envEnabled) return false;
  if (!organisation || organisation.status !== "ACTIVE") return false;
  return resolveOrganisationFeatureFlags(organisation.featureFlags)[key];
}

export function parseNonNegativeInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Unset or unreadable reserve is zero, so OpensDoors keeps today's spend. */
export function parsePlatformCreditReserve(raw: string | undefined): number {
  return parseNonNegativeInt(raw) ?? 0;
}

export type RocketReachSpendDecision = {
  allowed: number;
  stopReason: string | null;
};

/**
 * How many paid lookups this organisation may take right now.
 * The shared account cannot fall below the platform reserve, and a set
 * allowance is a hard stop. A null allowance is no extra cap.
 * An unknown balance does not invent a stop — the allowance still applies.
 */
export function rocketReachCreditsAllowed(input: {
  balance: number | "unlimited" | "unknown";
  platformReserve: number;
  allowance: number | null;
  used: number;
  requested: number;
}): RocketReachSpendDecision {
  const requested = Math.max(0, Math.trunc(input.requested));
  const used = Math.max(0, Math.trunc(input.used));
  const reserve = Math.max(0, Math.trunc(input.platformReserve));
  const orgRemaining =
    input.allowance === null ? Number.POSITIVE_INFINITY : Math.max(0, Math.trunc(input.allowance) - used);

  if (orgRemaining <= 0) {
    return { allowed: 0, stopReason: "This organisation has used its RocketReach credit allowance." };
  }

  let accountRemaining = Number.POSITIVE_INFINITY;
  if (input.balance === "unknown") {
    accountRemaining = Number.POSITIVE_INFINITY;
  } else if (input.balance === "unlimited") {
    accountRemaining = Number.POSITIVE_INFINITY;
  } else {
    accountRemaining = Math.max(0, Math.trunc(input.balance) - reserve);
    if (accountRemaining <= 0) {
      return {
        allowed: 0,
        stopReason: "RocketReach credits are held back for the platform reserve.",
      };
    }
  }

  const allowed = Math.min(requested, orgRemaining, accountRemaining);
  if (allowed <= 0) {
    return { allowed: 0, stopReason: "No RocketReach credits are available for this organisation." };
  }
  return { allowed: Math.trunc(allowed), stopReason: null };
}

export function aiSpendWithinCap(capMicroUsd: number | null, spentMicroUsd: number): boolean {
  if (capMicroUsd === null) return true;
  return spentMicroUsd < capMicroUsd;
}

export type { OrganisationFeatureFlags, OrganisationFeatureKey };
