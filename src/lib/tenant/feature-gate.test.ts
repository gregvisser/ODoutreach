import { describe, expect, it } from "vitest";

import {
  aiSpendWithinCap,
  organisationFeaturePermits,
  parsePlatformCreditReserve,
  rocketReachCreditsAllowed,
} from "./feature-gate";

const active = { status: "ACTIVE", featureFlags: {} };

describe("organisation feature ceiling", () => {
  it("keeps OpensDoors on when the environment is on and flags are empty", () => {
    expect(organisationFeaturePermits(active, "universe", true)).toBe(true);
    expect(organisationFeaturePermits(active, "machineSending", true)).toBe(true);
  });

  it("treats the environment off as off for every organisation", () => {
    expect(organisationFeaturePermits(active, "aiCampaigns", false)).toBe(false);
    expect(
      organisationFeaturePermits(
        { status: "ACTIVE", featureFlags: { aiCampaigns: true } },
        "aiCampaigns",
        false,
      ),
    ).toBe(false);
  });

  it("requires the organisation switch as well", () => {
    expect(
      organisationFeaturePermits(
        { status: "ACTIVE", featureFlags: { universe: false } },
        "universe",
        true,
      ),
    ).toBe(false);
  });

  it("stops a suspended organisation", () => {
    expect(organisationFeaturePermits({ status: "SUSPENDED", featureFlags: {} }, "humanSending", true)).toBe(
      false,
    );
    expect(organisationFeaturePermits(null, "humanSending", true)).toBe(false);
  });
});

describe("RocketReach organisation ledger", () => {
  it("leaves an unset reserve at zero", () => {
    expect(parsePlatformCreditReserve(undefined)).toBe(0);
    expect(parsePlatformCreditReserve("  ")).toBe(0);
    expect(parsePlatformCreditReserve("12")).toBe(12);
    expect(parsePlatformCreditReserve("-1")).toBe(0);
  });

  it("stops at the platform reserve and at the organisation allowance", () => {
    expect(
      rocketReachCreditsAllowed({
        balance: 100,
        platformReserve: 90,
        allowance: null,
        used: 0,
        requested: 20,
      }),
    ).toEqual({ allowed: 10, stopReason: null });

    expect(
      rocketReachCreditsAllowed({
        balance: 100,
        platformReserve: 90,
        allowance: null,
        used: 0,
        requested: 1,
      }).allowed,
    ).toBe(1);

    expect(
      rocketReachCreditsAllowed({
        balance: 50,
        platformReserve: 50,
        allowance: null,
        used: 0,
        requested: 1,
      }).allowed,
    ).toBe(0);

    expect(
      rocketReachCreditsAllowed({
        balance: 1000,
        platformReserve: 0,
        allowance: 5,
        used: 5,
        requested: 1,
      }),
    ).toMatchObject({ allowed: 0 });

    expect(
      rocketReachCreditsAllowed({
        balance: "unknown",
        platformReserve: 100,
        allowance: null,
        used: 0,
        requested: 3,
      }).allowed,
    ).toBe(3);
  });
});

describe("AI spend cap", () => {
  it("is open until a cap is set and then hard-stops", () => {
    expect(aiSpendWithinCap(null, 9_000)).toBe(true);
    expect(aiSpendWithinCap(100, 99)).toBe(true);
    expect(aiSpendWithinCap(100, 100)).toBe(false);
  });
});
