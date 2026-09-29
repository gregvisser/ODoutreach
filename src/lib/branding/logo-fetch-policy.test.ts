import { describe, expect, it } from "vitest";

import {
  assessLogoUrl,
  clientLogoSrc,
  isBlockedLogoAddress,
  logoContentType,
} from "./logo-fetch-policy";

describe("client logo fetch policy", () => {
  it("allows a public https logo and refuses private or odd targets", () => {
    expect(assessLogoUrl("https://renewabletemporarypower.co.uk/wp-content/uploads/2022/05/rtp-logo.svg").ok).toBe(
      true,
    );
    expect(assessLogoUrl("http://127.0.0.1/logo.png").ok).toBe(false);
    expect(assessLogoUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(assessLogoUrl("https://user:pass@cdn.example/logo.png").ok).toBe(false);
    expect(assessLogoUrl("https://cdn.example:8443/logo.png").ok).toBe(false);
    expect(assessLogoUrl("file:///etc/passwd").ok).toBe(false);
    expect(assessLogoUrl("http://localhost/logo.png").ok).toBe(false);
  });

  it("blocks private and link-local addresses", () => {
    expect(isBlockedLogoAddress("10.1.2.3")).toBe(true);
    expect(isBlockedLogoAddress("192.168.0.5")).toBe(true);
    expect(isBlockedLogoAddress("172.16.0.1")).toBe(true);
    expect(isBlockedLogoAddress("8.8.8.8")).toBe(false);
    expect(isBlockedLogoAddress("::1")).toBe(true);
    expect(isBlockedLogoAddress("fe80::1")).toBe(true);
  });

  it("keeps only image content types", () => {
    expect(logoContentType("image/svg+xml; charset=utf-8")).toBe("image/svg+xml");
    expect(logoContentType("text/html")).toBeNull();
  });

  it("points a saved logo at our proxy and a preview at the pasted URL", () => {
    expect(clientLogoSrc({ clientId: "c 1", logoUrl: "https://cdn.example/a.svg" })).toBe(
      "/api/clients/c%201/logo",
    );
    expect(clientLogoSrc({ logoUrl: "https://cdn.example/a.svg" })).toBe("https://cdn.example/a.svg");
    expect(clientLogoSrc({ clientId: "c1", logoUrl: null })).toBeNull();
  });
});