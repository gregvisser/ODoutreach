/**
 * Address lookup abstraction — wire a real provider when env keys exist.
 * No mock datasets shipped as live lookup.
 */

export type AddressSuggestion = {
  id: string;
  label: string;
  structured: {
    line1: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    formattedSummary: string;
  };
};

export type AddressLookupResult = {
  suggestions: AddressSuggestion[];
  /** When true, UI may show "no live API — enter address manually" */
  providerConfigured: boolean;
};

/**
 * No third-party address API is configured in this slice. When an
 * integration is added, read API keys here and map results to
 * `AddressSuggestion`.
 */
export async function searchAddresses(query: string): Promise<AddressLookupResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { suggestions: [], providerConfigured: false };
  }
  return { suggestions: [], providerConfigured: false };
}
