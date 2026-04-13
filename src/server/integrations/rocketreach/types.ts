/** RocketReach API contracts — expand as real endpoints are wired. */

export type RocketReachPersonLookupParams = {
  email?: string;
  linkedinUrl?: string;
};

export type RocketReachPersonResult = {
  id: string;
  status: "ok" | "not_found" | "error";
  email?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  raw?: Record<string, unknown>;
};
