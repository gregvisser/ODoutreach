import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MailboxOAuthAccountMismatchError } from "@/server/mailbox/mailbox-oauth-callback-shared";

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

  it("refuses a mismatch it cannot act for, naming BOTH addresses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403 }));
    // Whoever reads the refusal — banner, row, audit — needs to see the account
    // that approved AND the mailbox that was asked for. Either alone is useless.
    await expect(
      verifyGoogleMailboxOAuthForWorkspaceRow({
        accessToken: "t",
        mailboxEmailNormalized: "joe@b.co",
        oauthUserEmail: "Admin@B.co",
      }),
    ).rejects.toThrow(
      "You approved as admin@b.co, but this mailbox is joe@b.co. " +
        "Sign in as joe@b.co, or ask that person to connect their own mailbox.",
    );
  });

  it("refuses with a distinct type, so a callback can tell it apart from a generic failure", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403 }));
    await expect(
      verifyGoogleMailboxOAuthForWorkspaceRow({
        accessToken: "t",
        mailboxEmailNormalized: "joe@b.co",
        oauthUserEmail: "admin@b.co",
      }),
    ).rejects.toBeInstanceOf(MailboxOAuthAccountMismatchError);
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
