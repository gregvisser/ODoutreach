import { validateFollowUpScope } from "./followup-scope";

export type CampaignSchedulerSelection = { clientId: string; sequenceIds: string[] };

/** No configured selection means no autonomous worker scope, never all campaigns. */
export function parseCampaignSchedulerSelection(raw: string | undefined): CampaignSchedulerSelection | null {
  if (raw === undefined || raw.trim() === "") return null;
  if (raw.length > 12000) throw new Error("Campaign scheduler selection is too large");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid campaign scheduler selection");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== "clientId" && key !== "sequenceIds") ||
      typeof record.clientId !== "string" || !Array.isArray(record.sequenceIds)) {
    throw new Error("Campaign scheduler requires explicit client and campaign IDs");
  }
  validateFollowUpScope(record as CampaignSchedulerSelection);
  return { clientId: record.clientId, sequenceIds: [...record.sequenceIds] as string[] };
}
