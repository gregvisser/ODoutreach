export type SequenceListTopUpView = {
  sequenceId: string;
  /**
   * Set when an AI campaign owns this sequence. AI campaigns top up their own
   * list automatically (Universe first, 10-30 sized to mailbox capacity), so
   * the per-sequence toggle does not apply.
   */
  aiCampaign: null | { id: string; name: string; status: string };
  listName: string;
  killSwitchOn: boolean;
  clientAllows: boolean;
  clientBlockReason: string | null;
  readyNotEnrolled: number;
  plans: { id: string; name: string }[];
  rule: null | {
    planId: string;
    enabled: boolean;
    lowWaterMark: number;
    /** Daily safety budget. There is no monthly cap. */
    maxCreditsPerDay: number;
    balanceFloor: number;
    enabledByName: string | null;
    enabledAt: string | null;
  };
  lastRun: null | {
    status: string;
    trigger: string;
    finishedAt: string | null;
    creditsUsed: number;
    contactsAdded: number;
    detail: string | null;
  };
  creditsUsedToday: number;
  budgetLeftToday: number | null;
  /** Size of the next automatic top-up (10-30), sized to safe mailbox capacity. */
  nextTopUp: { batch: number; sendCapacity: number | null; note: string | null };
};
