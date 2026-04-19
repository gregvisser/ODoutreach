import { describe, expect, it, vi } from "vitest";

describe("encryptMailboxCredentialJson / decryptMailboxCredentialJson", () => {
  it("roundtrips stored credential payload", async () => {
    vi.stubEnv("MAILBOX_OAUTH_SECRET", "unit-test-mailbox-oauth-secret-32chars");
    const { encryptMailboxCredentialJson, decryptMailboxCredentialJson } = await import(
      "./oauth-crypto"
    );

    const original = {
      v: 1 as const,
      provider: "MICROSOFT" as const,
      refreshToken: "rt",
      accessToken: "at",
      accessTokenExpiresAt: Date.now() + 3600_000,
      scope: "offline_access User.Read",
    };

    const enc = encryptMailboxCredentialJson(original);
    expect(enc).not.toContain('"refreshToken"');
    expect(enc).not.toContain("offline_access");
    const back = decryptMailboxCredentialJson(enc);
    expect(back).toEqual(original);
  });
});
