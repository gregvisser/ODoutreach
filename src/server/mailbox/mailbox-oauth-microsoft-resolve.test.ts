import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/mailbox/microsoft-mailbox-oauth", () => ({
  fetchMicrosoftGraphPrimaryEmail: vi.fn(),
}));

import { formatMailboxOAuthAccountMismatch } from "@/lib/mailboxes/mailbox-oauth-banner-message";
import { MailboxOAuthAccountMismatchError } from "@/server/mailbox/mailbox-oauth-callback-shared";

import { resolveMicrosoftMailboxOAuthConnection } from "./mailbox-oauth-microsoft-resolve";
import { fetchMicrosoftGraphPrimaryEmail } from "./microsoft-mailbox-oauth";

describe("resolveMicrosoftMailboxOAuthConnection", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn() as unknown as typeof fetch,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchMicrosoftGraphPrimaryEmail).mockReset();
  });

  it("returns the OAuth user's Graph id when that user is the mailbox row", async () => {
    vi.mocked(fetchMicrosoftGraphPrimaryEmail).mockResolvedValue({
      id: "graph-self",
      primaryEmail: "a@b.co",
    });
    const r = await resolveMicrosoftMailboxOAuthConnection({
      accessToken: "t",
      mailboxEmailNormalized: "a@b.co",
    });
    expect(r.mailboxGraphUserId).toBe("graph-self");
    expect(r.oauthPrimaryEmail).toBe("a@b.co");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("probes inbox and resolves the target mailbox Graph id for a delegate", async () => {
    vi.mocked(fetchMicrosoftGraphPrimaryEmail).mockResolvedValue({
      id: "admin-graph",
      primaryEmail: "admin@b.co",
    });
    const f = vi.mocked(fetch);
    f.mockImplementation(async (input: string | URL | Request) => {
      const u =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      if (u.includes("/mailFolders/inbox/messages")) {
        return new Response(JSON.stringify({ value: [] }), { status: 200 });
      }
      if (u.includes("/users/") && u.includes("$select=id")) {
        return new Response(JSON.stringify({ id: "target-mailbox-graph-id" }), {
          status: 200,
        });
      }
      return new Response("unexpected", { status: 500 });
    });

    const r = await resolveMicrosoftMailboxOAuthConnection({
      accessToken: "t",
      mailboxEmailNormalized: "joe@b.co",
    });
    expect(r.mailboxGraphUserId).toBe("target-mailbox-graph-id");
    expect(r.oauthPrimaryEmail).toBe("admin@b.co");
  });

  it("throws a clear wrong-account message when delegate inbox returns 403", async () => {
    vi.mocked(fetchMicrosoftGraphPrimaryEmail).mockResolvedValue({
      id: "admin-graph",
      primaryEmail: "admin@b.co",
    });
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 403 }));

    await expect(
      resolveMicrosoftMailboxOAuthConnection({
        accessToken: "t",
        mailboxEmailNormalized: "joe@b.co",
      }),
    ).rejects.toThrow(
      formatMailboxOAuthAccountMismatch("admin@b.co", "joe@b.co"),
    );
  });

  it("raises the mismatch as its own type, so the callback can report it apart from a generic failure", async () => {
    vi.mocked(fetchMicrosoftGraphPrimaryEmail).mockResolvedValue({
      id: "admin-graph",
      primaryEmail: "admin@b.co",
    });
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 401 }));

    await expect(
      resolveMicrosoftMailboxOAuthConnection({
        accessToken: "t",
        mailboxEmailNormalized: "joe@b.co",
      }),
    ).rejects.toBeInstanceOf(MailboxOAuthAccountMismatchError);
  });
});
