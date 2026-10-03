import { isRocketReachIndustry } from "@/lib/clients/rocketreach-industries";
import { rocketReachImportPageCeiling } from "@/lib/clients/rocketreach-import-cap";
import {
  buildRocketReachCardQuery,
  type RocketReachCardQuery,
} from "@/lib/clients/rocketreach-search-query";
import { researchCriteriaSchema, type ResearchCriteria } from "@/lib/prospect-research/qualification";

/** Shown when People Search returns a page with no profiles. Not a credit failure. */
export const ROCKETREACH_PLAN_EMPTY_SEARCH_MESSAGE =
  "RocketReach found no matches for this plan — try broader filters";

export type PlanSearchBody = {
  query: RocketReachCardQuery;
  page_size: number;
  start: number;
  order_by: "relevance";
};

/**
 * Same People Search filters the manual card sends, capped at the manual import
 * limit. Automatic list top-up passes `maxBatch` to allow up to 30.
 */
export function researchPlanToSearchBody(
  criteriaInput: unknown,
  maxLookups: number,
  start: number,
  maxBatch?: number,
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
  // Seniority stays on the plan for Universe matching. It is not sent as
  // management_levels: that facet is absent from the card, and a free-text
  // value such as "Director" AND-filtered the search down to zero profiles.
  const query = buildRocketReachCardQuery({
    currentTitle: criteria.data.titles,
    industry: criteria.data.industries,
    location: criteria.data.regions,
  });
  if (Object.keys(query).length === 0) {
    return { ok: false, error: "This research plan's targeting is incomplete." };
  }
  return {
    ok: true,
    body: {
      query,
      page_size: Math.min(rocketReachImportPageCeiling(maxBatch), maxLookups),
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
  maxBatch?: number,
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
    maxBatch,
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
    `Seniority: ${criteria.seniorities.length > 0 ? criteria.seniorities.join("; ") : "not set"}`,
    `Regions: ${criteria.regions.join("; ")}`,
  ].join(" · ");
}
