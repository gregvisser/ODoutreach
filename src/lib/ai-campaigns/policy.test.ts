import { describe, expect, it } from "vitest";

import {
  aiCampaignContactsStillNeeded,
  aiCampaignSequenceHeldFromAutoSend,
  clampBatchToMailboxCap,
  creditsAllowedForAiCampaign,
  followUpSequenceIds,
  isAiCampaignConfirmation,
  isAiCampaignsEnabled,
  mailboxSlotsRemaining,
  mayAddPersonToAiCampaign,
  replyStopsSequence,
  sequenceMachineApprovalStep,
  staffMayControlAiCampaign,
  templateMachineApprovalStep,
  AI_CAMPAIGN_CONFIRMATION_PHRASE,
  AI_CAMPAIGN_SYSTEM_APPROVAL,
} from "./policy";

describe("AI campaign contact target", () => {
  it("does not ask for more people once the list or the stored total has reached the target", () => {
    expect(aiCampaignContactsStillNeeded(5, [0, 0])).toBe(5);
    expect(aiCampaignContactsStillNeeded(5, [0, 5])).toBe(0);
    expect(aiCampaignContactsStillNeeded(5, [10])).toBe(0);
    expect(aiCampaignContactsStillNeeded(5, [3, 4])).toBe(1);
    expect(aiCampaignContactsStillNeeded(5, [-2, Number.NaN])).toBe(5);
  });
});

describe("AI campaign kill switch", () => {
  it("stays off until the setting is an explicit on value", () => {
    expect(isAiCampaignsEnabled(undefined)).toBe(false);
    expect(isAiCampaignsEnabled("")).toBe(false);
    expect(isAiCampaignsEnabled("off")).toBe(false);
    expect(isAiCampaignsEnabled("true")).toBe(true);
    expect(isAiCampaignsEnabled(" ON ")).toBe(true);
    expect(isAiCampaignsEnabled("1")).toBe(true);
    expect(isAiCampaignsEnabled("yes")).toBe(true);
  });
});

describe("AI campaign confirmation and role", () => {
  it("accepts the start phrase only when it matches exactly", () => {
    expect(isAiCampaignConfirmation(`  ${AI_CAMPAIGN_CONFIRMATION_PHRASE}  `, AI_CAMPAIGN_CONFIRMATION_PHRASE)).toBe(true);
    expect(isAiCampaignConfirmation("start ai campaign", AI_CAMPAIGN_CONFIRMATION_PHRASE)).toBe(false);
  });

  it("lets operators start a campaign and refuses a viewer", () => {
    expect(staffMayControlAiCampaign("OPERATOR")).toBe(true);
    expect(staffMayControlAiCampaign("MANAGER")).toBe(true);
    expect(staffMayControlAiCampaign("ADMIN")).toBe(true);
    expect(staffMayControlAiCampaign("VIEWER")).toBe(false);
  });
});

describe("credit budget", () => {
  const base = {
    creditBudgetTotal: 20,
    creditsCommitted: 5,
    creditBudgetPerDay: 4,
    creditsCommittedToday: 1,
    balance: 100 as const,
    balanceFloor: 10,
  };

  it("limits a tick to the smallest of total, daily, and balance above the floor", () => {
    expect(creditsAllowedForAiCampaign(base)).toEqual({ allowed: 3, reason: null });
  });

  it("spends nothing when the balance cannot be read", () => {
    const result = creditsAllowedForAiCampaign({ ...base, balance: "unknown" });
    expect(result.allowed).toBe(0);
    expect(result.reason).toMatch(/balance/i);
  });

  it("spends nothing at the balance floor", () => {
    expect(creditsAllowedForAiCampaign({ ...base, balance: 10, balanceFloor: 10 }).allowed).toBe(0);
  });

  it("does not let a daily budget exceed the total that is left", () => {
    expect(creditsAllowedForAiCampaign({
      ...base,
      creditBudgetTotal: 6,
      creditsCommitted: 5,
      creditBudgetPerDay: 10,
      creditsCommittedToday: 0,
      balance: "unlimited",
    }).allowed).toBe(1);
  });

  it("never returns a negative allowance", () => {
    expect(creditsAllowedForAiCampaign({
      ...base,
      creditsCommitted: 50,
      creditsCommittedToday: 50,
      balance: 0,
    }).allowed).toBe(0);
  });
});

describe("do-not-contact and client privacy", () => {
  it("refuses a suppressed person and does not offer a bypass", () => {
    expect(mayAddPersonToAiCampaign({
      suppressed: true,
      unsubscribed: false,
      sourcedForThisClient: true,
    }).ok).toBe(false);
  });

  it("refuses an unsubscribed person and a person sourced for someone else", () => {
    expect(mayAddPersonToAiCampaign({
      suppressed: false,
      unsubscribed: true,
      sourcedForThisClient: true,
    }).ok).toBe(false);
    expect(mayAddPersonToAiCampaign({
      suppressed: false,
      unsubscribed: false,
      sourcedForThisClient: false,
    }).ok).toBe(false);
  });

  it("allows a person this client already sourced who is not blocked", () => {
    expect(mayAddPersonToAiCampaign({
      suppressed: false,
      unsubscribed: false,
      sourcedForThisClient: true,
    })).toEqual({ ok: true });
  });
});

describe("mailbox caps", () => {
  it("lets warm-up lower the daily cap and never raise it", () => {
    expect(mailboxSlotsRemaining({ sentToday: 4, dailyCap: 30, warmupCap: 5 })).toBe(1);
    expect(mailboxSlotsRemaining({ sentToday: 4, dailyCap: 30, warmupCap: 50 })).toBe(26);
    expect(mailboxSlotsRemaining({ sentToday: 30, dailyCap: 30, warmupCap: null })).toBe(0);
  });

  it("clamps a requested batch to the slots that are left", () => {
    const remaining = mailboxSlotsRemaining({ sentToday: 28, dailyCap: 30, warmupCap: null });
    expect(clampBatchToMailboxCap(100, remaining, 30)).toBe(2);
    expect(clampBatchToMailboxCap(100, remaining, 30)).toBeLessThanOrEqual(30);
  });
});

describe("reply stop", () => {
  it("stops on every label, including an unclassified reply", () => {
    for (const label of [null, "", "POSITIVE", "UNCLEAR", "NOT_INTERESTED", "UNSUBSCRIBE"]) {
      expect(replyStopsSequence(label).stop).toBe(true);
    }
  });

  it("does not treat an unclear reply as out-of-office", () => {
    expect(replyStopsSequence("UNCLEAR").reason).toMatch(/stops/i);
    expect(replyStopsSequence(null).reason).toMatch(/not classified/i);
  });
});

describe("machine approval steps", () => {
  it("walks a draft to ready and then to approved, and skips a template already approved by AI", () => {
    expect(templateMachineApprovalStep("DRAFT", null)).toBe("mark_ready");
    expect(templateMachineApprovalStep("READY_FOR_REVIEW", null)).toBe("approve");
    expect(templateMachineApprovalStep("APPROVED", AI_CAMPAIGN_SYSTEM_APPROVAL)).toBe("skip");
    expect(templateMachineApprovalStep("ARCHIVED", null)).toBe("refuse");
  });

  it("walks a sequence the same way", () => {
    expect(sequenceMachineApprovalStep("DRAFT")).toBe("mark_ready");
    expect(sequenceMachineApprovalStep("READY_FOR_REVIEW")).toBe("approve");
    expect(sequenceMachineApprovalStep("APPROVED")).toBe("skip");
  });
});

describe("human sequences stay on the human path", () => {
  it("does not include a hand-built sequence when the client is not on machine sending", () => {
    expect(followUpSequenceIds({
      machineSend: false,
      requestedSequenceIds: null,
      aiRunningSequenceIds: ["ai-seq"],
    })).toEqual(["ai-seq"]);
    expect(followUpSequenceIds({
      machineSend: false,
      requestedSequenceIds: ["human-seq", "ai-seq"],
      aiRunningSequenceIds: ["ai-seq"],
    })).toEqual(["ai-seq"]);
  });

  it("leaves a machine-sending client on the existing follow-up path", () => {
    expect(followUpSequenceIds({
      machineSend: true,
      requestedSequenceIds: null,
      aiRunningSequenceIds: [],
    })).toBeNull();
  });

  it("holds pacing for a paused campaign and for every campaign when the switch is off", () => {
    expect(aiCampaignSequenceHeldFromAutoSend({ killSwitchOn: true, status: "RUNNING" })).toBe(false);
    expect(aiCampaignSequenceHeldFromAutoSend({ killSwitchOn: true, status: "PAUSED" })).toBe(true);
    expect(aiCampaignSequenceHeldFromAutoSend({ killSwitchOn: false, status: "RUNNING" })).toBe(true);
  });
});
