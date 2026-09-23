import { describe, expect, it } from "vitest";

import {
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