import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyGoogleMailboxOAuthForWorkspaceRow } from "./mailbox-oauth-google-verify";

describe("verifyGoogleMailboxOAuthForWorkspaceRow", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn() as unknown as typeof fetch,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows when OAuth email matches the mailbox row", async () => {
    await expect(
      verifyGoogleMailboxOAuthForWorkspaceRow({
        accessToken: "t",
        mailboxEmailNormalized: "a@b.co",
        oauthUserEmail: "A@B.CO",
      }),
    ).resolves.toBeUndefined();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("throws when mismatched and Gmail profile is not accessible", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403 }));
    await expect(
      verifyGoogleMailboxOAuthForWorkspaceRow({
        accessToken: "t",
        mailboxEmailNormalized: "joe@b.co",
        oauthUserEmail: "admin@b.co",
      }),
    ).rejects.toThrow(/cannot access Gmail for joe@b.co/i);
  });

  it("allows mismatched emails when Gmail profile returns 200 (delegation edge case)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(
      verifyGoogleMailboxOAuthForWorkspaceRow({
        accessToken: "t",
        mailboxEmailNormalized: "joe@b.co",
        oauthUserEmail: "admin@b.co",
      }),
    ).resolves.toBeUndefined();
  });
});
