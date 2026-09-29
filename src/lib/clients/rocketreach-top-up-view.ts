export type SequenceListTopUpView = {
  sequenceId: string;
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
    maxCreditsPerRun: number;
    maxCreditsPerDay: number;
    maxCreditsPerMonth: number;
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
  creditsUsedThisMonth: number;
  budgetLeftToday: number | null;
  budgetLeftThisMonth: number | null;
};
