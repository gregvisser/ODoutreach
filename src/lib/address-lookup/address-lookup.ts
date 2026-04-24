import "server-only";

import { mapAzureMapsSearchResponse } from "./azure-maps-map";
import { validateAddressSearchInput } from "./address-search-input";
import type { AddressLookupResult } from "./types";

const AZURE_MAPS_KEY_ENV = "AZURE_MAPS_SUBSCRIPTION_KEY";

export type { AddressLookupResult, AddressSuggestion } from "./types";

/**
 * Resolves the Azure Maps subscription key from the server environment. Never log this value.
 */
function getAzureMapsSubscriptionKey(): string | undefined {
  const k = process.env[AZURE_MAPS_KEY_ENV]?.trim();
  return k && k.length > 0 ? k : undefined;
}

/**
 * UK-biased address search via Azure Maps Search Address (typeahead) — server only.
 * When the key is absent, returns an empty list and `providerConfigured: false` for a manual-entry fallback.
 */
export async function searchAddresses(query: string): Promise<AddressLookupResult> {
  const key = getAzureMapsSubscriptionKey();
  const v = validateAddressSearchInput(query);

  if (!v.ok) {
    return { suggestions: [], providerConfigured: !!key };
  }

  if (!key) {
    return { suggestions: [], providerConfigured: false };
  }

  const url = new URL("https://atlas.microsoft.com/search/address/json");
  url.searchParams.set("api-version", "1.0");
  url.searchParams.set("query", v.query);
  url.searchParams.set("countrySet", "GB");
  url.searchParams.set("language", "en-GB");
  url.searchParams.set("typeahead", "true");
  url.searchParams.set("limit", "10");
  url.searchParams.set("subscription-key", key);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return {
      suggestions: [],
      providerConfigured: true,
      lookupMessage: "We couldn't load address suggestions. You can type the full address in the fields below.",
      noMatches: false,
    };
  }

  if (!res.ok) {
    return {
      suggestions: [],
      providerConfigured: true,
      lookupMessage: "We couldn't load address suggestions. You can type the full address in the fields below.",
      noMatches: false,
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      suggestions: [],
      providerConfigured: true,
      lookupMessage: "We couldn't load address suggestions. You can type the full address in the fields below.",
    };
  }

  const suggestions = mapAzureMapsSearchResponse(body);
  return {
    suggestions,
    providerConfigured: true,
    noMatches: suggestions.length === 0,
    lookupMessage: null,
  };
}

export { AZURE_MAPS_KEY_ENV };
