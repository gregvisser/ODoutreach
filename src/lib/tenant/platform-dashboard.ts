/**
 * Pure shape of the platform dashboard. No database and no session.
 * The server loads rows and calls {@link assemblePlatformOrganisationOverviews}.
 */

import { formatMicroUsd } from "@/lib/ai/model-catalog";

export type OrganisationHealth = "healthy" | "attention" | "suspended";

const MAILBOX_ATTENTION = new Set(["CONNECTION_ERROR", "DISCONNECTED"]);

export type PlatformOrganisationSource = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  memberCount: number;
  rocketReachCreditsUsed: number;
  rocketReachCreditAllowance: number | null;
  aiSpendCapMicroUsd: number | null;
};

export type PlatformOrganisationOverview = PlatformOrganisationSource & {
  mailboxCount: number;
  mailboxesNeedingAttention: number;
  sendsToday: number;
  failedSendsToday: number;
  aiSpendMicroUsd: number;
  health: OrganisationHealth;
  healthLabel: string;
};

export function organisationHealth(input: {
  status: "ACTIVE" | "SUSPENDED";
  mailboxesNeedingAttention: number;
  failedSendsToday: number;
  aiCapReached?: boolean;
}): { health: OrganisationHealth; label: string } {
  if (input.status === "SUSPENDED") {
    return { health: "suspended", label: "Suspended" };
  }
  const parts: string[] = [];
  if (input.aiCapReached) {
    parts.push("AI paused: monthly AI spend cap reached");
  }
  if (input.mailboxesNeedingAttention > 0) {
    parts.push(
      input.mailboxesNeedingAttention === 1
        ? "1 mailbox needs reconnecting"
        : `${input.mailboxesNeedingAttention} mailboxes need reconnecting`,
    );
  }
  if (input.failedSendsToday > 0) {
    parts.push(
      input.failedSendsToday === 1 ? "1 send failed today" : `${input.failedSendsToday} sends failed today`,
    );
  }
  if (parts.length > 0) {
    return { health: "attention", label: parts.join(". ") };
  }
  return { health: "healthy", label: "Healthy" };
}

export function formatRocketReachCredits(used: number, allowance: number | null): string {
  if (allowance === null) return `${used} used, no cap`;
  return `${used} of ${allowance}`;
}

/** Month-to-date AI spend against the monthly cap. */
export function formatAiSpend(spentMicroUsd: number, capMicroUsd: number | null): string {
  const spent = formatMicroUsd(spentMicroUsd);
  if (capMicroUsd === null) return `${spent} this month, no cap`;
  const suffix = aiCapReached(spentMicroUsd, capMicroUsd) ? " (paused)" : "";
  return `${spent} of ${formatMicroUsd(capMicroUsd)} this month${suffix}`;
}

/** Same rule as the server gate: spend at or over the cap pauses AI. */
export function aiCapReached(spentMicroUsd: number, capMicroUsd: number | null): boolean {
  return capMicroUsd !== null && spentMicroUsd >= capMicroUsd;
}

function addCount(target: Map<string, number>, key: string, count: number): void {
  if (count <= 0) return;
  target.set(key, (target.get(key) ?? 0) + count);
}

/**
 * Roll client-level mailbox and send counts up to each organisation.
 * Sends today are rows with a sent timestamp on the UTC day the caller
 * already bounded. A later delivered or replied status still counts,
 * because the mail left today. Draft and pending mailboxes count in the
 * total and do not mark the organisation as needing attention.
 */
export function assemblePlatformOrganisationOverviews(input: {
  organisations: readonly PlatformOrganisationSource[];
  clients: readonly { id: string; organisationId: string }[];
  mailboxes: readonly { clientId: string; connectionStatus: string; count: number }[];
  sendsToday: readonly { clientId: string; count: number }[];
  failedSendsToday: readonly { clientId: string; count: number }[];
  aiSpendMicroUsd: readonly { organisationId: string; costMicroUsd: number }[];
}): PlatformOrganisationOverview[] {
  const orgByClient = new Map(input.clients.map((client) => [client.id, client.organisationId]));
  const mailboxes = new Map<string, number>();
  const attention = new Map<string, number>();
  const sends = new Map<string, number>();
  const failed = new Map<string, number>();
  const ai = new Map(input.aiSpendMicroUsd.map((row) => [row.organisationId, row.costMicroUsd]));

  for (const row of input.mailboxes) {
    const organisationId = orgByClient.get(row.clientId);
    if (!organisationId) continue;
    addCount(mailboxes, organisationId, row.count);
    if (MAILBOX_ATTENTION.has(row.connectionStatus)) {
      addCount(attention, organisationId, row.count);
    }
  }
  for (const row of input.sendsToday) {
    const organisationId = orgByClient.get(row.clientId);
    if (!organisationId) continue;
    addCount(sends, organisationId, row.count);
  }
  for (const row of input.failedSendsToday) {
    const organisationId = orgByClient.get(row.clientId);
    if (!organisationId) continue;
    addCount(failed, organisationId, row.count);
  }

  return input.organisations.map((organisation) => {
    const mailboxesNeedingAttention = attention.get(organisation.id) ?? 0;
    const failedSendsToday = failed.get(organisation.id) ?? 0;
    const aiSpendMicroUsd = ai.get(organisation.id) ?? 0;
    const health = organisationHealth({
      status: organisation.status,
      mailboxesNeedingAttention,
      failedSendsToday,
      aiCapReached: aiCapReached(aiSpendMicroUsd, organisation.aiSpendCapMicroUsd),
    });
    return {
      ...organisation,
      mailboxCount: mailboxes.get(organisation.id) ?? 0,
      mailboxesNeedingAttention,
      sendsToday: sends.get(organisation.id) ?? 0,
      failedSendsToday,
      aiSpendMicroUsd,
      health: health.health,
      healthLabel: health.label,
    };
  });
}
