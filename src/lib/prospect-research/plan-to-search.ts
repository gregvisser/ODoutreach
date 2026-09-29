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

export type PreviewSearchPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Null when every industry was invalid, so RocketReach must not be called. */
      body: PlanSearchBody | null;
      skippedIndustries: readonly string[];
      note: string;
    };

/**
 * Dry-run mapping. Invalid industries are skipped and named. A plan whose
 * industries are all invalid does not become an unfiltered RocketReach search.
 * The live spend path stays on {@link researchPlanToSearchBody}, which refuses.
 */
export function researchPlanToPreviewSearch(
  criteriaInput: unknown,
  maxLookups: number,
  start: number,
): PreviewSearchPlan {
  const criteria = researchCriteriaSchema.safeParse(criteriaInput);
  if (!criteria.success) return { ok: false, error: "This research plan's targeting is incomplete." };
  const skippedIndustries = criteria.data.industries.filter((industry) => !isRocketReachIndustry(industry));
  const valid = criteria.data.industries.filter((industry) => isRocketReachIndustry(industry));
  if (valid.length === 0) {
    return {
      ok: true,
      body: null,
      skippedIndustries,
      note: `RocketReach was not searched because none of these industries are in the RocketReach list: ${skippedIndustries.join(", ")}. Save a new plan using the industry names from the RocketReach card. Universe was still checked. No credit was spent.`,
    };
  }
  const mapped = researchPlanToSearchBody(
    { ...criteria.data, industries: valid },
    maxLookups,
    start,
  );
  if (!mapped.ok) return mapped;
  const note = skippedIndustries.length
    ? `Skipped industries that are not in the RocketReach list: ${skippedIndustries.join(", ")}. The preview used the remaining industries. No credit was spent.`
    : "";
  return { ok: true, body: mapped.body, skippedIndustries, note };
}

export function criteriaSummary(criteria: ResearchCriteria): string {
  return [
    `Titles: ${criteria.titles.join("; ")}`,
    `Industries: ${criteria.industries.join("; ")}`,
    `Seniority: ${criteria.seniorities.join("; ")}`,
    `Regions: ${criteria.regions.join("; ")}`,
  ].join(" · ");
}
