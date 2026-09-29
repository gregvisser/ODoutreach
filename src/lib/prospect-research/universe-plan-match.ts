import { qualifyResearchCandidate } from "@/lib/prospect-research/qualification";
import type { ResearchCriteria } from "@/lib/prospect-research/qualification";

export type UniversePlanPerson = {
  jobTitle: string | null;
  companyName: string | null;
  industry: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
};

/**
 * A Universe row matches a saved plan when every targeting field has evidence.
 * Title and seniority are read from the job title. Industry matches the
 * employer name or the industry. Region matches location, city, or country.
 * Seniority is the plan's keyword filter.
 */
export function universeMatchesResearchPlan(person: UniversePlanPerson, criteria: ResearchCriteria): boolean {
  const decision = qualifyResearchCandidate(
    criteria,
    {
      titles: person.jobTitle ?? "",
      industries: [person.industry, person.companyName].filter(Boolean).join(" "),
      seniorities: person.jobTitle ?? "",
      regions: [person.location, person.city, person.country].filter(Boolean).join(" "),
    },
    "CLEAR",
  );
  return decision.status === "MATCH";
}
