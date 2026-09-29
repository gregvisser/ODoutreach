import { describe, expect, it } from "vitest";
import { researchPlanToSearchBody } from "./plan-to-search";

const criteria = {
  titles: ["Head of Procurement"],
  industries: ["Construction - General"],
  seniorities: ["Director"],
  regions: ["United Kingdom"],
};

describe("researchPlanToSearchBody", () => {
  it("maps the four plan fields onto the manual RocketReach filters and the same cap", () => {
    const mapped = researchPlanToSearchBody(criteria, 100, 3);
    expect(mapped).toEqual({
      ok: true,
      body: {
        query: {
          current_title: ["Head of Procurement"],
          company_industry: ["Construction - General"],
          location: ["United Kingdom"],
          management_levels: ["Director"],
        },
        page_size: 10,
        start: 3,
        order_by: "relevance",
      },
    });
  });

  it("refuses an industry that the manual card would reject", () => {
    const mapped = researchPlanToSearchBody({ ...criteria, industries: ["Not A Real Industry"] }, 5, 1);
    expect(mapped.ok).toBe(false);
  });
});
