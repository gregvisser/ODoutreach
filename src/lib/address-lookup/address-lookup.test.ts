import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("searchAddresses", () => {
  const keyName = "AZURE_MAPS_SUBSCRIPTION_KEY";
  let previousKey: string | undefined;

  beforeEach(() => {
    previousKey = process.env[keyName];
    vi.resetModules();
  });

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env[keyName];
    } else {
      process.env[keyName] = previousKey;
    }
    vi.unstubAllGlobals();
  });

  it("returns not configured when the key is missing", async () => {
    delete process.env[keyName];
    const { searchAddresses } = await import("./address-lookup");
    const r = await searchAddresses("SW1A 1AA");
    expect(r.suggestions).toEqual([]);
    expect(r.providerConfigured).toBe(false);
  });

  it("does not call the provider for invalid input", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env[keyName] = "test-key";
    const { searchAddresses } = await import("./address-lookup");
    const r = await searchAddresses("a");
    expect(r.suggestions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests Azure Maps and maps suggestions without echoing the raw body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            type: "Point Address",
            id: "GB/PAD/t",
            score: 1,
            /* Should not appear in mapped output */
            viewport: { secretShape: "no" },
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
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env[keyName] = "test-key";
    const { searchAddresses } = await import("./address-lookup");
    const r = await searchAddresses("Exa");
    expect(r.providerConfigured).toBe(true);
    expect(r.noMatches).toBe(false);
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]?.structured).not.toHaveProperty("viewport");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("atlas.microsoft.com");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("countrySet=GB");
    const json = JSON.stringify(r);
    expect(json).not.toContain("viewport");
    expect(json).not.toContain("secretShape");
  });

  it("returns a friendly message when the HTTP request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    process.env[keyName] = "test-key";
    const { searchAddresses } = await import("./address-lookup");
    const r = await searchAddresses("Example");
    expect(r.suggestions).toEqual([]);
    expect(r.providerConfigured).toBe(true);
    expect(r.lookupMessage).toBeTruthy();
  });
});
