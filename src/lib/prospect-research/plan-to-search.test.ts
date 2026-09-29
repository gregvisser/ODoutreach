import { describe, expect, it } from "vitest";
import { researchPlanToPreviewSearch, researchPlanToSearchBody } from "./plan-to-search";

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

describe("researchPlanToPreviewSearch", () => {
  it("skips an invalid industry and still builds a dry-run search from the valid ones", () => {
    const preview = researchPlanToPreviewSearch(
      { ...criteria, industries: ["Construction - General", "QA0929 test industry"] },
      5,
      1,
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok || !preview.body) throw new Error("expected a search body");
    expect(preview.body.query.company_industry).toEqual(["Construction - General"]);
    expect(preview.skippedIndustries).toEqual(["QA0929 test industry"]);
    expect(preview.note).toMatch(/QA0929 test industry/);
    expect(preview.note).toMatch(/No credit was spent/);
  });

  it("does not search RocketReach when every industry is invalid", () => {
    const preview = researchPlanToPreviewSearch(
      { ...criteria, industries: ["QA0929 test industry"] },
      5,
      1,
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error("expected a dry-run result");
    expect(preview.body).toBeNull();
    expect(preview.note).toMatch(/QA0929 test industry/);
    expect(preview.note).toMatch(/No credit was spent/);
  });
});
