import "server-only";

import type {
  RocketReachPersonLookupParams,
  RocketReachPersonResult,
} from "./types";

/**
 * RocketReach HTTP client. The API key is read from env
 * (ROCKETREACH_API_KEY, see createRocketReachClient) and lookups short-circuit
 * to an error when it is unset. This is still a STUB: lookupPerson returns
 * `not_found` without calling the real API — wiring the actual HTTP calls,
 * retries and rate limits remains TODO (see lookupPerson).
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
