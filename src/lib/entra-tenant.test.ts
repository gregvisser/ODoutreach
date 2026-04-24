import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAllowedEntraTenantIdsFromEnv,
  isEntraSignInAllowed,
  isMultiTenantEntraIssuer,
} from "./entra-tenant";

describe("isMultiTenantEntraIssuer", () => {
  it("detects common endpoint", () => {
    expect(
      isMultiTenantEntraIssuer("https://login.microsoftonline.com/common/v2.0"),
    ).toBe(true);
  });

  it("detects organizations endpoint", () => {
    expect(
      isMultiTenantEntraIssuer(
        "https://login.microsoftonline.com/organizations/v2.0",
      ),
    ).toBe(true);
  });

  it("is false for a single-tenant issuer", () => {
    expect(
      isMultiTenantEntraIssuer(
        "https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff/v2.0",
      ),
    ).toBe(false);
  });
});

describe("isEntraSignInAllowed / getAllowedEntraTenantIdsFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows a single-tenant match", () => {
    const iss =
      "https://login.microsoftonline.com/AAAAAAAA-BBBB-CCCC-DDDD-EEEEFFFFFFFF/v2.0";
    expect(isEntraSignInAllowed(iss, "aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff")).toBe(
      true,
    );
    expect(isEntraSignInAllowed(iss, "00000000-0000-0000-0000-000000000000")).toBe(
      false,
    );
  });

  it("with multi-tenant issuer, fails closed when no allowlist is set", () => {
    vi.stubEnv("ALLOWED_ENTRA_TENANT_IDS", "");
    const iss = "https://login.microsoftonline.com/common/v2.0";
    expect(isEntraSignInAllowed(iss, "aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff")).toBe(
      false,
    );
  });

  it("with multi-tenant issuer, allows listed tenants only", () => {
    vi.stubEnv(
      "ALLOWED_ENTRA_TENANT_IDS",
      "aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff,11111111-2222-3333-4444-555555555555",
    );
    const iss = "https://login.microsoftonline.com/common/v2.0";
    expect(isEntraSignInAllowed(iss, "AAAAAAAA-BBBB-CCCC-DDDD-EEEEFFFFFFFF")).toBe(
      true,
    );
    expect(isEntraSignInAllowed(iss, "00000000-0000-0000-0000-000000000000")).toBe(
      false,
    );
  });

  it("parses ALLOWED_ENTRA_TENANT_IDS", () => {
    vi.stubEnv("ALLOWED_ENTRA_TENANT_IDS", " aaa, not-a-uuid, bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb ");
    expect(getAllowedEntraTenantIdsFromEnv()).toEqual([
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
  });
});
