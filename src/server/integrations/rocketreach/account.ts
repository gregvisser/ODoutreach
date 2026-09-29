import "server-only";

import { createHash } from "node:crypto";
import {
  parseRocketReachAccountBalance,
  type ParsedRocketReachBalance,
  type RocketReachCreditSnapshot,
} from "@/lib/clients/rocketreach-account-balance";

export const ROCKETREACH_API_V2_ACCOUNT = "https://api.rocketreach.co/api/v2/account/";

const CACHE_MS = 5 * 60 * 1000;

export type { RocketReachCreditSnapshot };

type CacheEntry = { at: number; keyId: string; value: RocketReachCreditSnapshot };

let cache: CacheEntry | null = null;

export function clearRocketReachAccountCache(): void {
  cache = null;
}

function keyId(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

export async function loadRocketReachCreditSnapshot(options?: {
  force?: boolean;
  now?: number;
  fetchImpl?: typeof fetch;
}): Promise<RocketReachCreditSnapshot> {
  const apiKey = process.env.ROCKETREACH_API_KEY?.trim();
  if (!apiKey) return { state: "unconfigured" };
  const now = options?.now ?? Date.now();
  const id = keyId(apiKey);
  if (!options?.force && cache && cache.keyId === id && now - cache.at < CACHE_MS) {
    return cache.value;
  }
  const fetchImpl = options?.fetchImpl ?? fetch;
  let snapshot: RocketReachCreditSnapshot;
  try {
    const response = await fetchImpl(ROCKETREACH_API_V2_ACCOUNT, {
      method: "GET",
      headers: { "Api-Key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    if (!response.ok) {
      snapshot = {
        state: "unavailable",
        message: "RocketReach credit balance is unavailable right now. A manual search can still run.",
      };
    } else {
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = null;
      }
      const parsed: ParsedRocketReachBalance | null = parseRocketReachAccountBalance(json);
      snapshot = parsed
        ? { state: "ready", label: parsed.label, remaining: parsed.remaining, fetchedAt: new Date(now).toISOString() }
        : {
            state: "unavailable",
            message: "RocketReach answered, but the credit balance was not in a form this page can show.",
          };
    }
  } catch {
    snapshot = {
      state: "unavailable",
      message: "RocketReach credit balance is unavailable right now. A manual search can still run.",
    };
  }
  cache = { at: now, keyId: id, value: snapshot };
  return snapshot;
}
