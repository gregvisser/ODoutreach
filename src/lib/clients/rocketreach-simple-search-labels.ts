import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";

/**
 * Visible RocketReach “simple search” field labels.
 * Employer / Job1 Title mirror the CSV twelve-label contract; locality uses
 * City / Country wording (not legacy “Location”) because this is a geographic
 * filter, not a CSV column name.
 */
export const ROCKETREACH_SIMPLE_SEARCH_LABELS = {
  keyword: "Keyword",
  employer: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[1],
  job1Title: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[8],
  locality: "City / Country",
  maxResults: "Max results",
} as const;
