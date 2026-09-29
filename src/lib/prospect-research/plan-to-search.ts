import { isRocketReachIndustry } from "@/lib/clients/rocketreach-industries";
import { ROCKETREACH_MAX_IMPORT } from "@/lib/clients/rocketreach-import-cap";
import { researchCriteriaSchema, type ResearchCriteria } from "@/lib/prospect-research/qualification";

export type PlanSearchBody = {
  query: {
    current_title: string[];
    company_industry: string[];
    location: string[];
    management_levels: string[];
  };
  page_size: number;
  start: number;
  order_by: "relevance";
};

/** Same People Search filters the manual card sends, capped at the manual import limit. */
export function researchPlanToSearchBody(
  criteriaInput: unknown,
  maxLookups: number,
  start: number,
): { ok: true; body: PlanSearchBody } | { ok: false; error: string } {
  const criteria = researchCriteriaSchema.safeParse(criteriaInput);
  if (!criteria.success) return { ok: false, error: "This research plan's targeting is incomplete." };
  const invalid = criteria.data.industries.filter((industry) => !isRocketReachIndustry(industry));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `These industries are not in the RocketReach list: ${invalid.join(", ")}. Save a new plan using the industry names from the RocketReach card.`,
    };
  }
  if (!Number.isSafeInteger(maxLookups) || maxLookups < 1) {
    return { ok: false, error: "The plan lookup limit must be a positive whole number." };
  }
  const pageStart = Number.isSafeInteger(start) && start >= 1 ? start : 1;
  return {
    ok: true,
    body: {
      query: {
        current_title: criteria.data.titles,
        company_industry: criteria.data.industries,
        location: criteria.data.regions,
        management_levels: criteria.data.seniorities,
      },
      page_size: Math.min(ROCKETREACH_MAX_IMPORT, maxLookups),
      start: pageStart,
      order_by: "relevance",
    },
  };
}

export function criteriaSummary(criteria: ResearchCriteria): string {
  return [
    `Titles: ${criteria.titles.join("; ")}`,
    `Industries: ${criteria.industries.join("; ")}`,
    `Seniority: ${criteria.seniorities.join("; ")}`,
    `Regions: ${criteria.regions.join("; ")}`,
  ].join(" · ");
}
