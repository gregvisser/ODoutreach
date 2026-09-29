/**
 * Pure parser for RocketReach GET /api/v2/account (free, no credits).
 * The live payload uses `credit_usage[]` with per-type remaining counts.
 * Universal accounts may return one object with `credits_remaining` instead.
 */

export type RocketReachCreditSnapshot =
  | { state: "ready"; label: string; remaining: number | "unlimited"; fetchedAt: string }
  | { state: "unavailable"; message: string }
  | { state: "unconfigured" };

export type ParsedRocketReachBalance = {
  remaining: number | "unlimited";
  label: string;
};

type CreditEntry = {
  creditType: string;
  remaining: number | "unlimited";
  allocated: number | "unlimited" | null;
};

function parseAmount(value: unknown): number | "unlimited" | null {
  if (value === "inf" || value === "Infinity" || value === "infinity") return "unlimited";
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function readEntries(json: unknown): CreditEntry[] {
  if (!json || typeof json !== "object") return [];
  const usage = (json as { credit_usage?: unknown }).credit_usage;
  if (Array.isArray(usage)) {
    const entries: CreditEntry[] = [];
    for (const row of usage) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const remaining = parseAmount(record.remaining ?? record.credits_remaining);
      if (remaining === null) continue;
      const allocated = parseAmount(record.allocated ?? record.credits_allocated);
      const creditType =
        typeof record.credit_type === "string" && record.credit_type.trim()
          ? record.credit_type.trim()
          : "credits";
      entries.push({ creditType, remaining, allocated });
    }
    return entries;
  }
  if (usage && typeof usage === "object") {
    const record = usage as Record<string, unknown>;
    const remaining = parseAmount(record.credits_remaining ?? record.remaining);
    if (remaining === null) return [];
    return [
      {
        creditType: "credits",
        remaining,
        allocated: parseAmount(record.credits_allocated ?? record.allocated),
      },
    ];
  }
  return [];
}

function isPersonCredit(creditType: string): boolean {
  return /person|lookup/i.test(creditType) && !/company/i.test(creditType);
}

function entryIsOnPlan(entry: CreditEntry): boolean {
  return entry.allocated !== 0;
}

function lowest(entries: CreditEntry[]): CreditEntry | null {
  const finite = entries.filter((entry) => entry.remaining !== "unlimited");
  if (finite.length === 0) return entries[0] ?? null;
  return finite.reduce((best, entry) =>
    (entry.remaining as number) < (best.remaining as number) ? entry : best,
  );
}

/** Returns null when the payload has no balance we can show. Callers degrade. */
export function parseRocketReachAccountBalance(json: unknown): ParsedRocketReachBalance | null {
  const onPlan = readEntries(json).filter(entryIsOnPlan);
  if (onPlan.length === 0) return null;
  const person = onPlan.filter((entry) => isPersonCredit(entry.creditType));
  const pool = person.length > 0 ? person : onPlan;
  const binding = lowest(pool);
  if (!binding) return null;
  if (binding.remaining === "unlimited") {
    return { remaining: "unlimited", label: "RocketReach credits: unlimited" };
  }
  const parts = pool
    .map((entry) =>
      entry.remaining === "unlimited"
        ? `${entry.creditType} unlimited`
        : `${entry.creditType} ${String(entry.remaining)}`,
    )
    .join(", ");
  const label =
    pool.length === 1
      ? `RocketReach credits remaining: ${String(binding.remaining)} (${binding.creditType})`
      : `RocketReach credits remaining: ${String(binding.remaining)} (lowest of ${parts})`;
  return { remaining: binding.remaining, label };
}

export function balanceAboveFloor(
  remaining: number | "unlimited",
  floor: number,
): boolean {
  if (remaining === "unlimited") return true;
  return remaining > floor;
}
