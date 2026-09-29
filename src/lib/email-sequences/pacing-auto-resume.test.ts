import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CAPACITY_HOLD_REASON,
  CALENDAR_HOLD_REASON,
  FAIR_SHARE_HOLD_REASON,
  PACING_HOLD_REASON,
} from "@/lib/clients/outreach-sequence-send-staff-copy";

import { isPacingAutoResumeRow } from "./pacing-auto-resume";

describe("isPacingAutoResumeRow", () => {
  it("resumes a READY row held only for pacing, calendar, capacity, or fair share", () => {
    for (const blockedReason of [
      PACING_HOLD_REASON,
      CALENDAR_HOLD_REASON,
      CAPACITY_HOLD_REASON,
      FAIR_SHARE_HOLD_REASON,
      "Held back by send pacing — the next batch is during today's sending hours. Launch this sequence again then; it will not send on its own.",
      "No mailbox capacity remaining in this sending day. Launch this sequence again on the next sending day; it will not send on its own.",
    ]) {
      expect(
        isPacingAutoResumeRow({ status: "READY", blockedReason, outboundEmailId: null }),
      ).toBe(true);
    }
  });

  it("does not release a do-not-contact or suppression hold", () => {
    const holds = [
      "On the suppression list.",
      "Recipient suppressed at dispatch (do-not-contact).",
      "Suppressed at dispatch (domain on the do not contact list).",
      "Held back by send pacing but the recipient is suppressed.",
      "Unsubscribe requested.",
      "Hard bounce.",
      "Enrollment is PAUSED — step skipped.",
      "Mailbox disconnected.",
      "Reply-stop recorded.",
    ];
    for (const blockedReason of holds) {
      expect(
        isPacingAutoResumeRow({ status: "READY", blockedReason, outboundEmailId: null }),
      ).toBe(false);
      expect(
        isPacingAutoResumeRow({ status: "SUPPRESSED", blockedReason: PACING_HOLD_REASON, outboundEmailId: null }),
      ).toBe(false);
    }
  });

  it("does not resume a row that is already queued or not READY", () => {
    expect(
      isPacingAutoResumeRow({
        status: "READY",
        blockedReason: PACING_HOLD_REASON,
        outboundEmailId: "outbound-1",
      }),
    ).toBe(false);
    expect(
      isPacingAutoResumeRow({
        status: "BLOCKED",
        blockedReason: PACING_HOLD_REASON,
        outboundEmailId: null,
      }),
    ).toBe(false);
    expect(
      isPacingAutoResumeRow({ status: "SENT", blockedReason: null, outboundEmailId: "outbound-1" }),
    ).toBe(false);
  });
});

describe("pacing hold migration", () => {
  const sql = readFileSync(
    "prisma/migrations/20260929183000_auto_release_pacing_holds/migration.sql",
    "utf8",
  );

  it("rewrites only READY pacing holds and does not change status", () => {
    expect(sql).toMatch(/WHERE status = 'READY'/);
    expect(sql).not.toMatch(/SET\s+"status"/i);
    expect(sql).toMatch(/NOT ILIKE '%suppress%'/);
    expect(sql).toMatch(/NOT ILIKE '%do not contact%'/);
    expect(sql).toMatch(/NOT ILIKE '%do-not-contact%'/);
    expect(sql).toMatch(/NOT ILIKE '%unsubscribe%'/);
    expect(sql).toMatch(/NOT ILIKE '%bounce%'/);
    expect(sql).toMatch(/NOT ILIKE '%paused%'/);
    expect(sql).toMatch(/NOT ILIKE '%sends automatically%'/);
  });
});

describe("pacing resume does not change enrolment or machine consent", () => {
  const source = readFileSync(
    "src/server/email-sequences/resume-pacing-holds.ts",
    "utf8",
  );

  it("does not enrol, plan new rows, or mark the send as unattended machine sending", () => {
    expect(source).not.toMatch(/enrollSequenceContacts|planSequenceStepSends/);
    expect(source).not.toMatch(/initiatedByAutomation/);
    expect(source).not.toMatch(/autoSendMaxOverdueMs/);
    expect(source).not.toMatch(/autonomousSendEnabled/);
    expect(source).not.toMatch(/openTracking|trackOpens/);
  });
});
