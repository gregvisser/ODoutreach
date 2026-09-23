import { describe, expect, it } from "vitest";

import {
  sequenceEnrollmentBlocksDispatchForStepSend,
  sequenceEnrollmentBlocksQueuedSend,
} from "./sequence-enrollment-send-hold";

describe("sequenceEnrollmentBlocksQueuedSend", () => {
  it("lets a still-active enrolment send", () => {
    expect(sequenceEnrollmentBlocksQueuedSend("PENDING")).toBe(false);
    expect(sequenceEnrollmentBlocksQueuedSend(null)).toBe(false);
    expect(sequenceEnrollmentBlocksQueuedSend(undefined)).toBe(false);
  });

  it("stops a queued follow-up after a reply, a pause, or an exclusion", () => {
    expect(sequenceEnrollmentBlocksQueuedSend("COMPLETED")).toBe(true);
    expect(sequenceEnrollmentBlocksQueuedSend("PAUSED")).toBe(true);
    expect(sequenceEnrollmentBlocksQueuedSend("EXCLUDED")).toBe(true);
  });
});

describe("sequenceEnrollmentBlocksDispatchForStepSend", () => {
  it("does not block mail with no step-send link semantics (non-sequence sends)", () => {
    expect(sequenceEnrollmentBlocksDispatchForStepSend("COMPLETED", null)).toBe(
      false,
    );
  });

  it("does not block when the linked step-send already finished (intro sent)", () => {
    expect(sequenceEnrollmentBlocksDispatchForStepSend("COMPLETED", "SENT")).toBe(
      false,
    );
    expect(
      sequenceEnrollmentBlocksDispatchForStepSend("EXCLUDED", "SKIPPED"),
    ).toBe(false);
  });

  it("blocks a still-queued follow-up when the enrolment has stopped", () => {
    expect(sequenceEnrollmentBlocksDispatchForStepSend("COMPLETED", "READY")).toBe(
      true,
    );
    expect(sequenceEnrollmentBlocksDispatchForStepSend("PAUSED", "PLANNED")).toBe(
      true,
    );
  });
});