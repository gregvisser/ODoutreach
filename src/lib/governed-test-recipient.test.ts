import { afterEach, describe, expect, it, vi } from "vitest";

import { allowedGovernedTestEmailDomains, isRecipientAllowedForGovernedTest } from "./governed-test-recipient";

describe("governed test recipient allowlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to bidlow.co.uk when env unset", () => {
    vi.unstubAllEnvs();
    delete process.env.GOVERNED_TEST_EMAIL_DOMAINS;
    expect(allowedGovernedTestEmailDomains()).toEqual(["bidlow.co.uk"]);
    expect(isRecipientAllowedForGovernedTest("user@bidlow.co.uk")).toBe(true);
    expect(isRecipientAllowedForGovernedTest("user@evil.com")).toBe(false);
  });

  it("accepts custom env allowlist", () => {
    vi.stubEnv("GOVERNED_TEST_EMAIL_DOMAINS", "opensdoors.local,example.org");
    expect(isRecipientAllowedForGovernedTest("a@opensdoors.local")).toBe(true);
    expect(isRecipientAllowedForGovernedTest("a@example.org")).toBe(true);
    expect(isRecipientAllowedForGovernedTest("a@bidlow.co.uk")).toBe(false);
  });
});
