import { describe, expect, it } from "vitest";
import {
  balanceAboveFloor,
  parseRocketReachAccountBalance,
} from "./rocketreach-account-balance";

describe("parseRocketReachAccountBalance", () => {
  it("reads the lowest person credit remaining from the account payload", () => {
    const parsed = parseRocketReachAccountBalance({
      credit_usage: [
        { credit_type: "person_lookup", allocated: 1000, used: 245, remaining: 755 },
        { credit_type: "person_export", allocated: 80, used: 30, remaining: 50 },
        { credit_type: "company_export", allocated: 10, used: 0, remaining: 10 },
      ],
    });
    expect(parsed).toMatchObject({ remaining: 50 });
    expect(parsed?.label).toContain("50");
    expect(parsed?.label).toContain("person_export");
  });

  it("ignores credit types that are not on the plan", () => {
    expect(
      parseRocketReachAccountBalance({
        credit_usage: [
          { credit_type: "person_export", allocated: 0, remaining: 0 },
          { credit_type: "person_lookup", allocated: 20, remaining: 12 },
        ],
      }),
    ).toMatchObject({ remaining: 12 });
  });

  it("treats inf as unlimited and degrades on an empty payload", () => {
    expect(
      parseRocketReachAccountBalance({
        credit_usage: [{ credit_type: "person_lookup", allocated: "inf", remaining: "inf" }],
      })?.remaining,
    ).toBe("unlimited");
    expect(parseRocketReachAccountBalance({})).toBeNull();
    expect(parseRocketReachAccountBalance({ credit_usage: { credits_remaining: 4 } })).toMatchObject({
      remaining: 4,
    });
  });
});

describe("balanceAboveFloor", () => {
  it("stops when the balance is on the floor and allows unlimited accounts", () => {
    expect(balanceAboveFloor(10, 10)).toBe(false);
    expect(balanceAboveFloor(11, 10)).toBe(true);
    expect(balanceAboveFloor("unlimited", 10_000)).toBe(true);
  });
});
