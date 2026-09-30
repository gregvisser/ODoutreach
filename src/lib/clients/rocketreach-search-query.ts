/**
 * People Search filters the Sources RocketReach card sends.
 * Plan runs and preview must use this builder. RocketReach ANDs every facet,
 * and `management_levels` is not one of the card's fields — staff type seniority
 * as free text for Universe matching, not as that enum.
 *
 * Industry values are the published names (`company_industry`), the same strings
 * as the card. Location is the same free-text `location` facet (country, city,
 * or "City::~50mi"), not a country id.
 */

export const ROCKETREACH_CARD_QUERY_KEYS = [
  "keyword",
  "company_name",
  "current_title",
  "location",
  "company_industry",
] as const;

export type RocketReachCardQueryKey = (typeof ROCKETREACH_CARD_QUERY_KEYS)[number];

export type RocketReachCardQuery = Partial<Record<RocketReachCardQueryKey, string[]>>;

export type RocketReachCardQueryInput = {
  keyword?: readonly string[];
  companyName?: readonly string[];
  currentTitle?: readonly string[];
  location?: readonly string[];
  industry?: readonly string[];
};

function cleaned(values: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

/** The query object inside `POST /api/v2/person/search`, matching the Sources card. */
export function buildRocketReachCardQuery(input: RocketReachCardQueryInput): RocketReachCardQuery {
  const query: RocketReachCardQuery = {};
  const put = (key: RocketReachCardQueryKey, values: readonly string[] | undefined) => {
    const next = cleaned(values);
    if (next.length > 0) query[key] = next;
  };
  put("keyword", input.keyword);
  put("company_name", input.companyName);
  put("current_title", input.currentTitle);
  put("location", input.location);
  put("company_industry", input.industry);
  return query;
}
