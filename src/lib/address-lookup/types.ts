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
  /** `true` when a subscription key is configured (lookup may be attempted). */
  providerConfigured: boolean;
  /** Shown for recoverable issues (e.g. network) — never includes secrets or raw API payloads. */
  lookupMessage?: string | null;
  /** `true` when a real search was executed and returned no usable rows. */
  noMatches?: boolean;
};
