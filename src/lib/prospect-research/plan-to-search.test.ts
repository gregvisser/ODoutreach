import { describe, expect, it } from "vitest";
import { buildRocketReachCardQuery } from "@/lib/clients/rocketreach-search-query";
import { researchPlanToPreviewSearch, researchPlanToSearchBody } from "./plan-to-search";

const criteria = {
  titles: ["Head of Procurement"],
  industries: ["Construction - General"],
  seniorities: ["Director"],
  regions: ["United Kingdom"],
};

describe("researchPlanToSearchBody", () => {
  it("keeps manual runs at 10 and lets automatic top-up ask for up to 30", () => {
    expect(researchPlanToSearchBody(criteria, 100, 1)).toMatchObject({ ok: true, body: { page_size: 10 } });
    expect(researchPlanToSearchBody(criteria, 24, 1, 24)).toMatchObject({ ok: true, body: { page_size: 24 } });
    expect(researchPlanToSearchBody(criteria, 100, 1, 100)).toMatchObject({ ok: true, body: { page_size: 30 } });
  });

  it("maps plan filters with the same query builder as the Sources card", () => {
    const mapped = researchPlanToSearchBody(criteria, 100, 3);
    const card = buildRocketReachCardQuery({
      currentTitle: ["Head of Procurement"],
      industry: ["Construction - General"],
      location: ["United Kingdom"],
    });
    expect(mapped).toEqual({
      ok: true,
      body: {
        query: card,
        page_size: 10,
        start: 3,
        order_by: "relevance",
      },
    });
    if (!mapped.ok) throw new Error("expected a search body");
    expect(mapped.body.query).not.toHaveProperty("management_levels");
  });

  it("keeps optional seniority off the RocketReach query for the logistics plan", () => {
    const withSeniority = researchPlanToSearchBody({
      titles: ["Head of Operations"],
      industries: ["Logistics & Supply Chain - General"],
      seniorities: ["Director"],
      regions: ["United Kingdom"],
    }, 10, 1);
    const withoutSeniority = researchPlanToSearchBody({
      titles: ["Head of Operations"],
      industries: ["Logistics & Supply Chain - General"],
      seniorities: [],
      regions: ["United Kingdom"],
    }, 10, 1);
    const card = buildRocketReachCardQuery({
      currentTitle: ["Head of Operations"],
      industry: ["Logistics & Supply Chain - General"],
      location: ["United Kingdom"],
    });
    expect(withSeniority).toEqual(withoutSeniority);
    expect(withSeniority).toMatchObject({ ok: true, body: { query: card, page_size: 10, start: 1 } });
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
