import { describe, expect, it } from "vitest";
import { universeMatchesResearchPlan } from "./universe-plan-match";

const criteria = {
  titles: ["Head of Procurement"],
  industries: ["Construction"],
  seniorities: ["Director"],
  regions: ["United Kingdom"],
};

describe("universeMatchesResearchPlan", () => {
  it("matches title, employer or industry, seniority, and location", () => {
    expect(universeMatchesResearchPlan({
      jobTitle: "Director, Head of Procurement",
      companyName: "Example Construction",
      industry: null,
      location: "Manchester, United Kingdom",
      city: null,
      country: null,
    }, criteria)).toBe(true);
  });

  it("does not match a person outside the plan", () => {
    expect(universeMatchesResearchPlan({
      jobTitle: "Director, Head of Procurement",
      companyName: "Example Bakery",
      industry: "Food",
      location: "Manchester, United Kingdom",
      city: null,
      country: null,
    }, criteria)).toBe(false);
  });
});