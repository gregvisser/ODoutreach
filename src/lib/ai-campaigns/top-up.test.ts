import { describe, expect, it } from "vitest";

import { aiCampaignTopUp } from "./policy";

describe("aiCampaignTopUp", () => {
  it("sizes the first batch and each top-up to mailbox capacity, 10-30", () => {
    // Two warm mailboxes at 20 a day: 40 a day, 120 over three days.
    expect(aiCampaignTopUp({ mailboxDailyCaps: [20, 20], awaitingFirstEmail: 0 })).toEqual({
      firstBatch: 30,
      lowWater: 30,
      batch: 30,
      dailyCapacity: 40,
    });
    // One new mailbox warming up at 3 a day: 9 over three days, clamped up to 10.
    expect(aiCampaignTopUp({ mailboxDailyCaps: [3], awaitingFirstEmail: 0 })).toMatchObject({
      firstBatch: 10,
      lowWater: 5,
      batch: 10,
    });
  });

  it("does not buy while enough people are already waiting", () => {
    expect(aiCampaignTopUp({ mailboxDailyCaps: [10], awaitingFirstEmail: 40 }).batch).toBe(0);
  });

  it("still sources a minimum batch before any mailbox is connected", () => {
    expect(aiCampaignTopUp({ mailboxDailyCaps: [], awaitingFirstEmail: 0 })).toMatchObject({
      firstBatch: 10,
      batch: 10,
      dailyCapacity: 0,
    });
  });
});
