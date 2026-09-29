import { describe, expect, it } from "vitest";
import { AUTOMATIC_LIST_TOP_UP_TRAINING } from "./rocketreach-top-up-copy";

describe("automatic list top-up training copy", () => {
  it("explains the limits in plain language and does not ask a client to approve it", () => {
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING).toContain("Greg Visser is the only approver");
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING).toContain("does not enrol");
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING).toContain("does not send");
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING).toContain("ROCKETREACH_AUTO_REFILL");
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING).toContain("another client");
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING).toContain("Find matches in Universe");
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING.toLowerCase()).not.toContain("client to approve");
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING.toLowerCase()).not.toContain("ask the client");
    expect(AUTOMATIC_LIST_TOP_UP_TRAINING.toLowerCase()).not.toContain("customer approval");
  });
});