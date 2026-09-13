import { afterEach, describe, expect, it } from "vitest";

import {
  confirmedPreviousSendTime,
  isFollowupRequiresSentIntroEnabled,
  isIntroOutboundActuallySent,
} from "./followup-sent-intro-policy";

describe("confirmed previous send time", () => {
  it("requires an actual timestamp and confirmed sending state", () => {
    const sentAt = new Date("2026-09-13T14:22:00Z");
    expect(confirmedPreviousSendTime({ status: "SENT", sentAt })).toBe(sentAt.toISOString());
    expect(confirmedPreviousSendTime({ status: "SENT", sentAt: null })).toBeNull();
    expect(confirmedPreviousSendTime({ status: "SENT", sentAt: new Date(NaN) })).toBeNull();
    expect(confirmedPreviousSendTime({ status: "QUEUED", sentAt })).toBeNull();
    expect(confirmedPreviousSendTime({ status: "FAILED", sentAt })).toBeNull();
    expect(confirmedPreviousSendTime(null)).toBeNull();
  });
});

describe("isIntroOutboundActuallySent (H5)", () => {
  it("treats sent-with-proof statuses as actually sent", () => {
    for (const s of ["SENT", "DELIVERED", "REPLIED", "BOUNCED"]) {
      expect(isIntroOutboundActuallySent(s)).toBe(true);
    }
  });

  it("treats never-sent / in-flight statuses as NOT sent", () => {
    for (const s of [
      "QUEUED",
      "PROCESSING",
      "FAILED",
      "BLOCKED_SUPPRESSION",
      "REQUESTED",
      "PREPARING",
    ]) {
      expect(isIntroOutboundActuallySent(s)).toBe(false);
    }
  });

  it("treats a missing linked outbound (null/undefined) as NOT sent", () => {
    expect(isIntroOutboundActuallySent(null)).toBe(false);
    expect(isIntroOutboundActuallySent(undefined)).toBe(false);
    expect(isIntroOutboundActuallySent("")).toBe(false);
  });
});

describe("isFollowupRequiresSentIntroEnabled (H5 flag)", () => {
  const prev = process.env.FOLLOWUP_REQUIRES_SENT_INTRO;
  afterEach(() => {
    if (prev === undefined) delete process.env.FOLLOWUP_REQUIRES_SENT_INTRO;
    else process.env.FOLLOWUP_REQUIRES_SENT_INTRO = prev;
  });

  it("is OFF by default and only true for the exact 'true' value", () => {
    delete process.env.FOLLOWUP_REQUIRES_SENT_INTRO;
    expect(isFollowupRequiresSentIntroEnabled()).toBe(false);
    process.env.FOLLOWUP_REQUIRES_SENT_INTRO = "false";
    expect(isFollowupRequiresSentIntroEnabled()).toBe(false);
    process.env.FOLLOWUP_REQUIRES_SENT_INTRO = "TRUE";
    expect(isFollowupRequiresSentIntroEnabled()).toBe(true);
    process.env.FOLLOWUP_REQUIRES_SENT_INTRO = "true";
    expect(isFollowupRequiresSentIntroEnabled()).toBe(true);
  });
});
