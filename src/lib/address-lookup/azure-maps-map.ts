import type { AddressSuggestion } from "./types";

/** Subset of Azure Maps Search Address response — internal only, not sent to the client. */
type AzureMapsAddress = {
  streetNumber?: string;
  streetName?: string;
  municipalitySubdivision?: string;
  municipality?: string;
  countrySecondarySubdivision?: string;
  countryTertiarySubdivision?: string;
  countrySubdivisionName?: string;
  countrySubdivisionCode?: string;
  postalCode?: string;
  countryCode?: string;
  country?: string;
  freeformAddress?: string;
  localName?: string;
};

export type AzureMapsSearchResultItem = {
  type?: string;
  id?: string;
  address?: AzureMapsAddress;
};

export function pickUkCity(a: AzureMapsAddress): string | undefined {
  const local = a.localName?.trim();
  if (local) return local;
  const muni = a.municipality?.trim() ?? "";
  if (!muni) return undefined;
  if (muni.includes(",")) {
    return muni.split(",")[0]!.trim() || undefined;
  }
  return muni;
}

/**
 * First line of a UK-style address from street parts, with freeform as fallback.
 */
export function line1FromAzureMapsAddress(a: AzureMapsAddress): string {
  const n = a.streetNumber?.trim() ?? "";
  const s = a.streetName?.trim() ?? "";
  if (n && s) {
    return `${n} ${s}`.replace(/\s+/g, " ");
  }
  if (s) {
    return s;
  }
  if (n) {
    return n;
  }
  const ff = a.freeformAddress?.trim() ?? "";
  if (ff) {
    const first = ff.split(",")[0]?.trim() ?? "";
    if (first) {
      return first;
    }
  }
  return "";
}

export function line2FromAzureMapsAddress(a: AzureMapsAddress, line1: string): string | undefined {
  const sub = a.municipalitySubdivision?.trim() ?? "";
  if (!sub || sub === line1) {
    return undefined;
  }
  return sub;
}

function regionFromAzureMapsAddress(a: AzureMapsAddress): string | undefined {
  const n = a.countrySubdivisionName?.trim();
  if (n) {
    return n;
  }
  return a.countrySecondarySubdivision?.trim() || a.countryTertiarySubdivision?.trim() || undefined;
}

/**
 * Suggestion list label — one readable line, preferring Azure freeform text.
 */
export function labelFromAzureMapsAddress(a: AzureMapsAddress): string {
  const ff = a.freeformAddress?.trim();
  if (ff) {
    return ff;
  }
  const parts: string[] = [];
  const l1 = line1FromAzureMapsAddress(a);
  if (l1) {
    parts.push(l1);
  }
  const city = pickUkCity(a);
  if (city) {
    parts.push(city);
  }
  const pc = a.postalCode?.trim();
  if (pc) {
    parts.push(pc);
  }
  return parts.join(", ") || "Address";
}

/**
 * Maps a single Azure Maps `results[]` entry into a Brief structured suggestion.
 * Returns `null` when the result is not a GB address or has no usable line 1.
 */
export function mapAzureMapsResultToSuggestion(
  item: AzureMapsSearchResultItem,
  index: number,
): AddressSuggestion | null {
  const addr = item.address;
  if (!addr) {
    return null;
  }
  const code = (addr.countryCode ?? "").toUpperCase();
  if (code && code !== "GB") {
    return null;
  }
  const line1 = line1FromAzureMapsAddress(addr);
  if (!line1) {
    return null;
  }
  const id = (item.id && item.id.length > 0 ? item.id : `azmaps-${index}`) + "";
  const city = pickUkCity(addr);
  const line2 = line2FromAzureMapsAddress(addr, line1);
  const label = labelFromAzureMapsAddress(addr);
  return {
    id,
    label,
    structured: {
      line1,
      line2,
      city,
      region: regionFromAzureMapsAddress(addr),
      postalCode: addr.postalCode?.trim() || undefined,
      country: addr.country?.trim() || (code === "GB" ? "United Kingdom" : undefined),
      formattedSummary: addr.freeformAddress?.trim() || label,
    },
  };
}

/**
 * Parses a Search Address JSON body and returns normalized (non-secret) suggestions.
 */
export function mapAzureMapsSearchResponse(json: unknown): AddressSuggestion[] {
  if (typeof json !== "object" || json === null) {
    return [];
  }
  const results = (json as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }
  const out: AddressSuggestion[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i] as AzureMapsSearchResultItem;
    const s = mapAzureMapsResultToSuggestion(item, i);
    if (s) {
      out.push(s);
    }
  }
  return out;
}
