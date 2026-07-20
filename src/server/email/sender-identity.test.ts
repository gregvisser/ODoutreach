import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SenderIdentityStatus } from "@/generated/prisma/enums";

import { resolveValidatedSenderForClient } from "./sender-identity";

const FALLBACK = "noreply@opensdoors.local";

const ENV_KEYS = [
  "DEFAULT_OUTBOUND_FROM",
  "ALLOWED_SENDER_EMAIL_DOMAINS",
  "EMAIL_PROVIDER",
] as const;

const originalEnv: Record<string, string | undefined> = {};

function resolve(
  overrides: Partial<{
    clientDefaultSenderEmail: string | null;
    clientSenderIdentityStatus: SenderIdentityStatus;
    rowFromAddress: string | null;
  }> = {},
) {
  return resolveValidatedSenderForClient({
    clientDefaultSenderEmail: null,
    clientSenderIdentityStatus: "NOT_SET",
    rowFromAddress: null,
    ...overrides,
  });
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("resolveValidatedSenderForClient — precedence", () => {
  it("prefers the row's From address above all else", () => {
    process.env.DEFAULT_OUTBOUND_FROM = "env@example.com";
    expect(
      resolve({
        rowFromAddress: "row@example.com",
        clientDefaultSenderEmail: "client@example.com",
      }).from,
    ).toBe("row@example.com");
  });

  it("falls back to the workspace default when the row has none", () => {
    process.env.DEFAULT_OUTBOUND_FROM = "env@example.com";
    expect(resolve({ clientDefaultSenderEmail: "client@example.com" }).from).toBe(
      "client@example.com",
    );
  });

  it("falls back to DEFAULT_OUTBOUND_FROM when neither row nor workspace is set", () => {
    process.env.DEFAULT_OUTBOUND_FROM = "env@example.com";
    expect(resolve().from).toBe("env@example.com");
  });

  it("falls back to the platform address when nothing is configured", () => {
    expect(resolve().from).toBe(FALLBACK);
  });

  it("treats a blank or whitespace-only address as unset", () => {
    process.env.DEFAULT_OUTBOUND_FROM = "env@example.com";
    expect(resolve({ rowFromAddress: "   ", clientDefaultSenderEmail: "" }).from).toBe(
      "env@example.com",
    );
  });

  it("normalizes the resolved address to lowercase and trims it", () => {
    expect(resolve({ rowFromAddress: "  Sales@Example.COM  " }).from).toBe(
      "sales@example.com",
    );
  });
});

describe("resolveValidatedSenderForClient — malformed addresses", () => {
  it("replaces an address with no @ with the fallback and warns", () => {
    const result = resolve({ rowFromAddress: "not-an-email" });
    expect(result.from).toBe(FALLBACK);
    expect(result.warnings).toContain("Invalid sender address shape — using fallback");
  });

  it("does not warn about shape for a well-formed address", () => {
    expect(resolve({ rowFromAddress: "ok@example.com" }).warnings).not.toContain(
      "Invalid sender address shape — using fallback",
    );
  });
});

describe("resolveValidatedSenderForClient — domain allowlist", () => {
  it("permits any domain when the allowlist is unset", () => {
    expect(resolve({ rowFromAddress: "anyone@anywhere.test" }).from).toBe(
      "anyone@anywhere.test",
    );
  });

  it("permits a domain that is on the allowlist", () => {
    process.env.ALLOWED_SENDER_EMAIL_DOMAINS = "opensdoors.co.uk,bidlow.co.uk";
    expect(resolve({ rowFromAddress: "greg@bidlow.co.uk" }).from).toBe(
      "greg@bidlow.co.uk",
    );
  });

  it("throws for a domain that is not on the allowlist", () => {
    // Hard failure is deliberate: sending from an unapproved domain damages
    // deliverability for every workspace on the platform.
    process.env.ALLOWED_SENDER_EMAIL_DOMAINS = "opensdoors.co.uk";
    expect(() => resolve({ rowFromAddress: "greg@evil.test" })).toThrow(
      /Sender domain "evil.test" is not in ALLOWED_SENDER_EMAIL_DOMAINS/,
    );
  });

  it("matches allowlist entries case-insensitively and ignores spacing", () => {
    process.env.ALLOWED_SENDER_EMAIL_DOMAINS = "  OpensDoors.co.uk ,  bidlow.co.uk  ";
    expect(resolve({ rowFromAddress: "greg@OPENSDOORS.CO.UK" }).from).toBe(
      "greg@opensdoors.co.uk",
    );
  });

  it("ignores empty entries in the allowlist", () => {
    process.env.ALLOWED_SENDER_EMAIL_DOMAINS = "opensdoors.co.uk,,";
    expect(() => resolve({ rowFromAddress: "a@opensdoors.co.uk" })).not.toThrow();
  });

  it("blocks a subdomain that is not itself listed", () => {
    process.env.ALLOWED_SENDER_EMAIL_DOMAINS = "opensdoors.co.uk";
    expect(() => resolve({ rowFromAddress: "a@mail.opensdoors.co.uk" })).toThrow();
  });

  it("applies the allowlist to the fallback address too", () => {
    // The fallback must not be a loophole around the allowlist.
    process.env.ALLOWED_SENDER_EMAIL_DOMAINS = "opensdoors.co.uk";
    expect(() => resolve()).toThrow(/opensdoors\.local/);
  });
});

describe("resolveValidatedSenderForClient — warnings and verification", () => {
  it("warns when falling back to a global sender", () => {
    expect(resolve().warnings).toContain(
      "Using global DEFAULT_OUTBOUND_FROM or platform fallback — set Client.defaultSenderEmail for this workspace.",
    );
  });

  it("does not warn when the workspace has its own sender", () => {
    expect(
      resolve({ clientDefaultSenderEmail: "client@example.com" }).warnings,
    ).toHaveLength(0);
  });

  it("does not warn when the row carries its own From address", () => {
    expect(resolve({ rowFromAddress: "row@example.com" }).warnings).toHaveLength(0);
  });

  it("requires verification on the resend transport when identity is not verified", () => {
    process.env.EMAIL_PROVIDER = "resend";
    const result = resolve({
      rowFromAddress: "a@example.com",
      clientSenderIdentityStatus: "NOT_SET",
    });
    expect(result.verificationRequired).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/not VERIFIED_READY/);
  });

  it("does not require verification once the identity is VERIFIED_READY", () => {
    process.env.EMAIL_PROVIDER = "resend";
    expect(
      resolve({
        rowFromAddress: "a@example.com",
        clientSenderIdentityStatus: "VERIFIED_READY",
      }).verificationRequired,
    ).toBe(false);
  });

  it("does not require verification on the default mock transport", () => {
    // Mailbox sends go via Graph/Gmail, not Resend — no Resend verification applies.
    expect(
      resolve({
        rowFromAddress: "a@example.com",
        clientSenderIdentityStatus: "NOT_SET",
      }).verificationRequired,
    ).toBe(false);
  });

  it("matches the transport name case-insensitively", () => {
    process.env.EMAIL_PROVIDER = "  ReSeNd  ";
    expect(
      resolve({
        rowFromAddress: "a@example.com",
        clientSenderIdentityStatus: "NOT_SET",
      }).verificationRequired,
    ).toBe(true);
  });

  it("echoes the supplied identity status back to the caller", () => {
    expect(
      resolve({
        rowFromAddress: "a@example.com",
        clientSenderIdentityStatus: "VERIFIED_READY",
      }).identityStatus,
    ).toBe("VERIFIED_READY");
  });
});
