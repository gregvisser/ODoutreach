import "server-only";

import type {
  RocketReachPersonLookupParams,
  RocketReachPersonResult,
} from "./types";

/**
 * RocketReach HTTP client — TODO: wire real auth (API key from env), retries, rate limits.
 * All methods must receive tenant context (clientId) for logging/auditing; never mix tenants.
 */
export class RocketReachClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly clientIdForAudit: string,
  ) {}

  async lookupPerson(
    params: RocketReachPersonLookupParams,
  ): Promise<RocketReachPersonResult> {
    void params;
    if (!this.apiKey) {
      return {
        id: "stub",
        status: "error",
        raw: { message: "ROCKETREACH_API_KEY not configured" },
      };
    }

    // TODO: GET/POST RocketReach API — see https://rocketreach.co/api
    return {
      id: `stub-${this.clientIdForAudit}`,
      status: "not_found",
      raw: { stub: true },
    };
  }
}

export function createRocketReachClient(
  clientId: string,
): RocketReachClient {
  return new RocketReachClient(process.env.ROCKETREACH_API_KEY, clientId);
}
