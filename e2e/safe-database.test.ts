import { describe, expect, it } from "vitest";

import { assertSafeTestDatabase } from "./safe-database";

const LOCAL_E2E_URL = "postgresql://e2e:pw@localhost:5434/odoutreach_e2e?schema=public";

describe("assertSafeTestDatabase", () => {
  it("accepts a local throwaway e2e database", () => {
    expect(() => assertSafeTestDatabase(LOCAL_E2E_URL)).not.toThrow();
  });

  it("accepts a CI service-container host", () => {
    expect(() =>
      assertSafeTestDatabase("postgresql://e2e:pw@postgres:5432/odoutreach_test"),
    ).not.toThrow();
  });

  it.each(["localhost", "127.0.0.1", "db"])(
    "accepts allowed host %s",
    (host) => {
      expect(() =>
        assertSafeTestDatabase(`postgresql://e2e:pw@${host}:5432/app_e2e`),
      ).not.toThrow();
    },
  );

  it("rejects a missing url rather than falling back", () => {
    expect(() => assertSafeTestDatabase(undefined)).toThrow(/required/i);
    expect(() => assertSafeTestDatabase("   ")).toThrow(/required/i);
  });

  it("rejects a malformed url", () => {
    expect(() => assertSafeTestDatabase("not-a-url")).toThrow(/not a valid url/i);
  });

  it("rejects a remote host even when the database name looks like a test", () => {
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://u:p@opensdoors-prod.postgres.database.azure.com:5432/odoutreach_e2e",
      ),
    ).toThrow(/non-local database host/i);
  });

  it("rejects a local host when the database is not obviously a test database", () => {
    expect(() =>
      assertSafeTestDatabase("postgresql://u:p@localhost:5432/opensdoors_outreach"),
    ).toThrow(/must contain "e2e" or "test"/i);
  });

  it("returns the parsed url so callers can reuse it", () => {
    const url = assertSafeTestDatabase(LOCAL_E2E_URL);
    expect(url.hostname).toBe("localhost");
    expect(url.port).toBe("5434");
  });
});
