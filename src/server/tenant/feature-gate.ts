import "server-only";

import { prisma } from "@/lib/db";
import {
  aiSpendWithinCap,
  organisationFeaturePermits,
  parsePlatformCreditReserve,
  rocketReachCreditsAllowed,
  type RocketReachSpendDecision,
} from "@/lib/tenant/feature-gate";
import type { OrganisationFeatureKey } from "@/lib/tenant/organisation";

type OrganisationDelegate = {
  findUnique?: (args: {
    where: { id: string };
    select: Record<string, boolean>;
  }) => Promise<Record<string, unknown> | null>;
  update?: (args: {
    where: { id: string };
    data: { rocketReachCreditsUsed: { increment: number } };
  }) => Promise<unknown>;
};

type ClientDelegate = {
  findUnique?: (args: {
    where: { id: string };
    select: { organisationId: boolean };
  }) => Promise<{ organisationId: string } | null>;
};

function organisationDelegate(): OrganisationDelegate | null {
  const delegate = (prisma as unknown as { organisation?: OrganisationDelegate }).organisation;
  if (!delegate || typeof delegate.findUnique !== "function") return null;
  return delegate;
}

function clientDelegate(): ClientDelegate | null {
  const delegate = (prisma as unknown as { client?: ClientDelegate }).client;
  if (!delegate || typeof delegate.findUnique !== "function") return null;
  return delegate;
}

/**
 * Environment already decided. When this process has no organisation
 * delegate (a partial test double), the environment decision stands.
 * Production always has the delegate, so a missing organisation fails closed.
 */
export async function clientFeatureEnabled(
  clientId: string,
  key: OrganisationFeatureKey,
  envEnabled: boolean,
): Promise<boolean> {
  if (!envEnabled) return false;
  const clients = clientDelegate();
  const organisations = organisationDelegate();
  const findClient = clients?.findUnique;
  const findOrganisation = organisations?.findUnique;
  if (!findClient || !findOrganisation) return true;
  const client = await findClient({
    where: { id: clientId },
    select: { organisationId: true },
  });
  if (!client?.organisationId) return false;
  return organisationFeatureEnabledById(client.organisationId, key, true);
}

export async function organisationFeatureEnabledById(
  organisationId: string,
  key: OrganisationFeatureKey,
  envEnabled: boolean,
): Promise<boolean> {
  if (!envEnabled) return false;
  const findOrganisation = organisationDelegate()?.findUnique;
  if (!findOrganisation) return true;
  const organisation = await findOrganisation({
    where: { id: organisationId },
    select: { status: true, featureFlags: true },
  });
  if (!organisation) return false;
  return organisationFeaturePermits(
    {
      status: String(organisation.status),
      featureFlags: organisation.featureFlags,
    },
    key,
    true,
  );
}

export async function organisationAiCapBlocks(input: {
  clientId: string | null;
  organisationId: string | null;
}): Promise<boolean> {
  const findOrganisation = organisationDelegate()?.findUnique;
  const aggregate = (
    prisma as unknown as {
      aiUsageEvent?: {
        aggregate?: (args: {
          where: { organisationId: string; status: "OK" };
          _sum: { costMicroUsd: boolean };
        }) => Promise<{ _sum: { costMicroUsd: number | null } }>;
      };
    }
  ).aiUsageEvent?.aggregate;
  if (!findOrganisation || typeof aggregate !== "function") return false;

  let organisationId = input.organisationId;
  if (!organisationId && input.clientId) {
    const findClient = clientDelegate()?.findUnique;
    if (!findClient) return false;
    const client = await findClient({
      where: { id: input.clientId },
      select: { organisationId: true },
    });
    organisationId = client?.organisationId ?? null;
  }
  if (!organisationId) return false;

  const organisation = await findOrganisation({
    where: { id: organisationId },
    select: { aiSpendCapMicroUsd: true },
  });
  const cap = organisation?.aiSpendCapMicroUsd;
  if (typeof cap !== "number") return false;
  const spent = await aggregate({
    where: { organisationId, status: "OK" },
    _sum: { costMicroUsd: true },
  });
  return !aiSpendWithinCap(cap, spent._sum.costMicroUsd ?? 0);
}

export type RocketReachCeiling = {
  enforced: boolean;
  organisationId: string | null;
  allowance: number | null;
  used: number;
  buyingEnabled: boolean;
};

export async function loadRocketReachCeiling(clientId: string): Promise<RocketReachCeiling> {
  const open = { enforced: false, organisationId: null, allowance: null, used: 0, buyingEnabled: true };
  const findClient = clientDelegate()?.findUnique;
  const findOrganisation = organisationDelegate()?.findUnique;
  if (!findClient || !findOrganisation) return open;
  const client = await findClient({
    where: { id: clientId },
    select: { organisationId: true },
  });
  if (!client?.organisationId) {
    return { ...open, enforced: true, buyingEnabled: false };
  }
  const organisation = await findOrganisation({
    where: { id: client.organisationId },
    select: {
      status: true,
      featureFlags: true,
      rocketReachCreditAllowance: true,
      rocketReachCreditsUsed: true,
    },
  });
  if (!organisation) return { ...open, enforced: true, buyingEnabled: false };
  const buyingEnabled = organisationFeaturePermits(
    { status: String(organisation.status), featureFlags: organisation.featureFlags },
    "rocketReachBuying",
    true,
  );
  return {
    enforced: true,
    organisationId: client.organisationId,
    allowance:
      typeof organisation.rocketReachCreditAllowance === "number"
        ? organisation.rocketReachCreditAllowance
        : null,
    used: typeof organisation.rocketReachCreditsUsed === "number" ? organisation.rocketReachCreditsUsed : 0,
    buyingEnabled,
  };
}

/** True when this import must consult the shared balance or stop locally. */
export function rocketReachCeilingConstrains(ceiling: RocketReachCeiling): boolean {
  if (!ceiling.enforced) return false;
  if (!ceiling.buyingEnabled) return true;
  if (ceiling.allowance !== null) return true;
  return parsePlatformCreditReserve(process.env.ROCKETREACH_PLATFORM_RESERVE_CREDITS) > 0;
}

export function decideRocketReachSpend(input: {
  ceiling: RocketReachCeiling;
  balance: number | "unlimited" | "unknown";
  requested: number;
}): RocketReachSpendDecision {
  if (!input.ceiling.enforced) return { allowed: input.requested, stopReason: null };
  if (!input.ceiling.buyingEnabled) {
    return { allowed: 0, stopReason: "RocketReach buying is switched off for this organisation." };
  }
  return rocketReachCreditsAllowed({
    balance: input.balance,
    platformReserve: parsePlatformCreditReserve(process.env.ROCKETREACH_PLATFORM_RESERVE_CREDITS),
    allowance: input.ceiling.allowance,
    used: input.ceiling.used,
    requested: input.requested,
  });
}

export async function recordRocketReachCreditUse(organisationId: string, credits: number): Promise<void> {
  if (credits <= 0) return;
  const update = organisationDelegate()?.update;
  if (!update) return;
  await update({
    where: { id: organisationId },
    data: { rocketReachCreditsUsed: { increment: credits } },
  });
}
