import type { AiCampaignStatus } from "./state-machine";

/** Shown on the Outreach page. Safe to import from a client component. */
export type AiCampaignListItem = {
  id: string;
  name: string;
  status: AiCampaignStatus;
  statusLabel: string;
};
