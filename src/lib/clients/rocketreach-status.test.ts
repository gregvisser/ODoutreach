import { describe, expect, it } from "vitest";

import { rocketReachConnectionStatus } from "./rocketreach-status";

describe("rocketReachConnectionStatus", () => {
  it("shows connected copy when the API key is configured", () => {
    const status = rocketReachConnectionStatus(true);

    expect(status.label).toBe("Connected");
    expect(status.description).toContain("Use it to find and add contacts");
  });

  it("shows administrator guidance when RocketReach is not configured", () => {
    const status = rocketReachConnectionStatus(false);

    expect(status.label).toBe("Not connected");
    expect(status.description).toContain("Ask an administrator to add the API key");
  });
});
