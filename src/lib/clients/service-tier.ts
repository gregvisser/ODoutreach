export const SERVICE_TIERS = ["MAINTENANCE", "GROWTH", "STRATEGIC"] as const;
export type ServiceTier = typeof SERVICE_TIERS[number];
export const SERVICE_TIER_LABELS: Record<ServiceTier, string> = {
  MAINTENANCE: "Maintenance", GROWTH: "Growth", STRATEGIC: "Strategic",
};
export type ServiceTierSnapshot = { tier: ServiceTier | null; revision: number; setAt: string | null; setByName: string | null };
