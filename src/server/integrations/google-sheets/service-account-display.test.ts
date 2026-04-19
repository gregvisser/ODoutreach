import { describe, expect, it, vi, afterEach } from "vitest";

import { extractGoogleSpreadsheetId } from "@/lib/spreadsheet-url";

const SA_JSON = JSON.stringify({
  type: "service_account",
  project_id: "demo",
  private_key:
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----\n",
  client_email: "sync-bot@demo-project.iam.gserviceaccount.com",
});

describe("getGoogleServiceAccountDisplayInfo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns configured false when env is empty", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", "");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    const { getGoogleServiceAccountDisplayInfo } = await import("./service-account-display");
    const r = getGoogleServiceAccountDisplayInfo();
    expect(r.configured).toBe(false);
    expect(r.clientEmail).toBeNull();
  });

  it("extracts client_email from GOOGLE_SERVICE_ACCOUNT_JSON without exposing private_key", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", SA_JSON);
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", "");
    const { getGoogleServiceAccountDisplayInfo } = await import("./service-account-display");
    const r = getGoogleServiceAccountDisplayInfo();
    expect(r.configured).toBe(true);
    expect(r.clientEmail).toBe("sync-bot@demo-project.iam.gserviceaccount.com");
    expect(JSON.stringify(r)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(r)).not.toContain("private_key");
  });

  it("extracts client_email from GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", Buffer.from(SA_JSON, "utf8").toString("base64"));
    const { getGoogleServiceAccountDisplayInfo } = await import("./service-account-display");
    const r = getGoogleServiceAccountDisplayInfo();
    expect(r.configured).toBe(true);
    expect(r.clientEmail).toBe("sync-bot@demo-project.iam.gserviceaccount.com");
  });

  it("returns configured false for invalid JSON", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "{not-json");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", "");
    const { getGoogleServiceAccountDisplayInfo } = await import("./service-account-display");
    const r = getGoogleServiceAccountDisplayInfo();
    expect(r.configured).toBe(false);
    expect(r.clientEmail).toBeNull();
  });

  it("still parses spreadsheet URLs (regression)", () => {
    expect(
      extractGoogleSpreadsheetId(
        "https://docs.google.com/spreadsheets/d/abc123xyz789abcdefghijk/edit#gid=0",
      ),
    ).toBe("abc123xyz789abcdefghijk");
  });

  it("returns configured false when client_email is missing", async () => {
    vi.stubEnv(
      "GOOGLE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({ type: "service_account", private_key: "x" }),
    );
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", "");
    const { getGoogleServiceAccountDisplayInfo } = await import("./service-account-display");
    const r = getGoogleServiceAccountDisplayInfo();
    expect(r.configured).toBe(false);
    expect(r.clientEmail).toBeNull();
  });
});
