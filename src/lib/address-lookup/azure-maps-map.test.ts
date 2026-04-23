import { describe, expect, it } from "vitest";

import {
  labelFromAzureMapsAddress,
  line1FromAzureMapsAddress,
  mapAzureMapsResultToSuggestion,
  mapAzureMapsSearchResponse,
} from "./azure-maps-map";

describe("line1FromAzureMapsAddress", () => {
  it("joins number and street", () => {
    const l1 = line1FromAzureMapsAddress({
      streetNumber: "1",
      streetName: "Example Street",
    });
    expect(l1).toBe("1 Example Street");
  });

  it("falls back to the first freeformAddress segment", () => {
    const l1 = line1FromAzureMapsAddress({
      freeformAddress: "1 Example Street, Townville, T1 1AA",
    });
    expect(l1).toBe("1 Example Street");
  });
});

describe("labelFromAzureMapsAddress", () => {
  it("prefers freeformAddress for dropdown labels", () => {
    const l = labelFromAzureMapsAddress({
      freeformAddress: "1 Example St, City, ZZ9 9ZZ",
      countryCode: "GB",
    });
    expect(l).toBe("1 Example St, City, ZZ9 9ZZ");
  });
});

describe("mapAzureMapsResultToSuggestion", () => {
  it("skips non-GB results", () => {
    const s = mapAzureMapsResultToSuggestion(
      {
        id: "X",
        address: {
          countryCode: "US",
          freeformAddress: "Somewhere",
          streetName: "A",
        },
      },
      0,
    );
    expect(s).toBeNull();
  });

  it("maps a GB result without leaking non-address fields in structured output", () => {
    const s = mapAzureMapsResultToSuggestion(
      {
        id: "GB/PAD/x",
        type: "Point Address",
        address: {
          streetNumber: "1",
          streetName: "Example St",
          municipality: "Municipality Name",
          postalCode: "ZZ9 9ZZ",
          countryCode: "GB",
          country: "United Kingdom",
          freeformAddress: "1 Example St, Municipality Name, ZZ9 9ZZ, United Kingdom",
        },
      },
      0,
    );
    expect(s).not.toBeNull();
    expect(s?.structured.line1).toBe("1 Example St");
    expect(s?.structured.city).toBe("Municipality Name");
    expect(s?.structured.country).toBe("United Kingdom");
    expect(s?.structured.postalCode).toBe("ZZ9 9ZZ");
    expect(s?.structured.formattedSummary).toBe(
      "1 Example St, Municipality Name, ZZ9 9ZZ, United Kingdom",
    );
    expect(s?.structured.line2).toBeUndefined();
    expect(s?.structured.region).toBeUndefined();
    expect(s?.id).toBe("GB/PAD/x");
  });
});

describe("mapAzureMapsSearchResponse", () => {
  it("returns an empty list for non-objects", () => {
    expect(mapAzureMapsSearchResponse(null)).toEqual([]);
    expect(mapAzureMapsSearchResponse(12)).toEqual([]);
  });

  it("ignores a missing results array", () => {
    expect(mapAzureMapsSearchResponse({ summary: {} })).toEqual([]);
  });
});
