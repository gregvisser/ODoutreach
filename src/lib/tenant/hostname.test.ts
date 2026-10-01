import { describe, expect, it } from "vitest";

import { OPENSDOORS_ORGANISATION_ID } from "./organisation";
import {
  OPENSDOORS_PUBLIC_HOST,
  parseOrganisationHostname,
  resolveOrganisationIdForHost,
  safeAppOrigin,
} from "./hostname";

const rows = [
  { id: OPENSDOORS_ORGANISATION_ID, hostname: OPENSDOORS_PUBLIC_HOST },
  { id: "org_northwind", hostname: "northwind.bidlow.co.uk" },
];

describe("resolveOrganisationIdForHost", () => {
  it("keeps opensdoors.bidlow.co.uk on OpensDoors even if another row claims it", () => {
    const stolen = [
      { id: "org_northwind", hostname: OPENSDOORS_PUBLIC_HOST },
      { id: OPENSDOORS_ORGANISATION_ID, hostname: null },
    ];
    expect(resolveOrganisationIdForHost("OpensDoors.bidlow.co.uk", stolen)).toBe(
      OPENSDOORS_ORGANISATION_ID,
    );
    expect(resolveOrganisationIdForHost("opensdoors.bidlow.co.uk:443", stolen)).toBe(
      OPENSDOORS_ORGANISATION_ID,
    );
  });

  it("resolves a saved hostname and leaves an unknown host on OpensDoors", () => {
    expect(resolveOrganisationIdForHost("northwind.bidlow.co.uk", rows)).toBe("org_northwind");
    expect(resolveOrganisationIdForHost("app-opensdoors-outreach-prod.azurewebsites.net", rows)).toBe(
      OPENSDOORS_ORGANISATION_ID,
    );
    expect(resolveOrganisationIdForHost("localhost:3000", rows)).toBe(OPENSDOORS_ORGANISATION_ID);
    expect(resolveOrganisationIdForHost(null, rows)).toBe(OPENSDOORS_ORGANISATION_ID);
  });
});

describe("safeAppOrigin", () => {
  it("uses the saved host and refuses a forged one", () => {
    expect(safeAppOrigin({
      requestHost: "northwind.bidlow.co.uk",
      registeredHosts: ["northwind.bidlow.co.uk"],
      authUrl: "https://opensdoors.bidlow.co.uk",
    })).toBe("https://northwind.bidlow.co.uk");
    expect(safeAppOrigin({
      requestHost: "evil.example",
      registeredHosts: ["northwind.bidlow.co.uk"],
      authUrl: "https://opensdoors.bidlow.co.uk",
    })).toBeNull();
  });

  it("keeps the OpensDoors AUTH_URL origin, including its scheme", () => {
    expect(safeAppOrigin({
      requestHost: "opensdoors.bidlow.co.uk",
      registeredHosts: [],
      authUrl: "https://opensdoors.bidlow.co.uk/",
    })).toBe("https://opensdoors.bidlow.co.uk");
    expect(safeAppOrigin({
      requestHost: "localhost:3000",
      registeredHosts: [],
      authUrl: "http://localhost:3000",
    })).toBe("http://localhost:3000");
  });
});

describe("parseOrganisationHostname", () => {
  it("rejects the OpensDoors host on any other organisation and accepts a clear", () => {
    expect(parseOrganisationHostname("opensdoors.bidlow.co.uk", "org_northwind")).toEqual({
      ok: false,
      error: "opensdoors.bidlow.co.uk stays OpensDoors.",
    });
    expect(parseOrganisationHostname("https://northwind.bidlow.co.uk/login", "org_northwind").ok).toBe(false);
    expect(parseOrganisationHostname("  Northwind.bidlow.co.uk. ", "org_northwind")).toEqual({
      ok: true,
      hostname: "northwind.bidlow.co.uk",
    });
    expect(parseOrganisationHostname("  ", "org_northwind")).toEqual({ ok: true, hostname: null });
    expect(parseOrganisationHostname(OPENSDOORS_PUBLIC_HOST, OPENSDOORS_ORGANISATION_ID)).toEqual({
      ok: true,
      hostname: OPENSDOORS_PUBLIC_HOST,
    });
  });
});
