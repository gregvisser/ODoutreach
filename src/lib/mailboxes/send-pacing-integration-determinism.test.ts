import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isSendPacingEnabled } from "@/lib/mailboxes/send-pacing";

/**
 * The integration suite must give the same answer at 03:00 as at 13:00.
 *
 * Send pacing is ON unless `MAILBOX_SEND_PACING` says otherwise, and it
 * releases a mailbox's daily allowance across a 07:00-18:00 UTC window read
 * from the REAL clock. `sendSequenceStepBatch` consults it, so outside that
 * window the paced allowance is 0 and any integration test that dispatches a
 * batch is held back.
 *
 * That is not a product fault — in production the outbound-queue cron only runs
 * inside the same window, so the two agree. It is a test-harness fault, and on
 * 2026-08-28 it reddened E2E on four unrelated PRs at once (#301, #302, #303,
 * #304), each failing J5 on `expect(batch.blocked).toEqual([])` with "Held back
 * by send pacing". Nothing could merge until 07:00 UTC.
 *
 * `vitest.integration.config.ts` therefore pins the flag off. This test is the
 * lock: delete that line and the failure comes back, but only between 18:00 and
 * 07:00, which is the worst kind of red to diagnose.
 */

const integrationConfigSource = readFileSync(
  join(process.cwd(), "vitest.integration.config.ts"),
  "utf8",
);

describe("integration suite is deterministic with respect to the clock", () => {
  it("pins MAILBOX_SEND_PACING off in the integration vitest config", () => {
    expect(integrationConfigSource).toMatch(
      /MAILBOX_SEND_PACING:\s*"(false|off|0|no)"/,
    );
  });

  it("records why, so the line is not tidied away as noise", () => {
    expect(integrationConfigSource).toMatch(/pacing/i);
    expect(integrationConfigSource).toMatch(/07:00/);
  });

  it("uses a value the pacing flag actually reads as off", () => {
    const match = /MAILBOX_SEND_PACING:\s*"([^"]*)"/.exec(
      integrationConfigSource,
    );
    expect(match).not.toBeNull();

    const previous = process.env.MAILBOX_SEND_PACING;
    try {
      process.env.MAILBOX_SEND_PACING = match?.[1] ?? "";
      // The real predicate, not a copy of its rules — a config value that only
      // looked like "off" would pass a string check and still pace.
      expect(isSendPacingEnabled()).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.MAILBOX_SEND_PACING;
      else process.env.MAILBOX_SEND_PACING = previous;
    }
  });
});
