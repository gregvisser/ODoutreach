import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Drives the real Microsoft callback handler.
 *
 * This route had no test of its own until 2026-08-28. It was added with the
 * `oauthStateExpiresAt` gate because the gate exists in two places, and a fix
 * proven on one of two identical callbacks is a fix proven on half the app —
 * this project's most expensive recurring defect is machinery that reports
 * success without firing.
 */

const { prismaMock, auditMock, staffMock, exchangeMock, resolveMock } =
  vi.hoisted(() => {
    const update = vi.fn();
    const upsert = vi.fn();
    return {
      prismaMock: {
        update,
        clientMailboxIdentity: { findFirst: vi.fn(), update },
        mailboxIdentitySecret: { upsert },
        $transaction: vi.fn(
          async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
              clientMailboxIdentity: { update },
              mailboxIdentitySecret: { upsert },
            }),
        ),
      },
      auditMock: vi.fn(),
      staffMock: vi.fn(),
      exchangeMock: vi.fn(),
      resolveMock: vi.fn(),
    };
  });

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/server/auth/staff", () => ({ tryGetOpensDoorsStaff: staffMock }));
vi.mock("@/server/mailbox/microsoft-mailbox-oauth", () => ({
  exchangeMicrosoftMailboxAuthCode: exchangeMock,
}));
vi.mock("@/server/mailbox/mailbox-oauth-microsoft-resolve", () => ({
  resolveMicrosoftMailboxOAuthConnection: resolveMock,
}));
vi.mock("@/server/mailbox/mailbox-connection-audit", () => ({
  auditMailboxConnectionChange: auditMock,
}));
vi.mock("@/server/mailbox/mailbox-primary-consistency", () => ({
  reconcilePrimaryMailboxForClient: vi.fn(),
}));
vi.mock("@/server/mailbox/oauth-crypto", () => ({
  encryptMailboxCredentialJson: vi.fn(() => "encrypted"),
}));

import {
  mailboxOAuthBanner,
  readMailboxOAuthSearchParams,
} from "@/lib/mailboxes/mailbox-oauth-banner-message";

import { GET } from "./route";

/** A row as `prepareMailboxOAuthConnection` really leaves it: state + expiry. */
const MAILBOX = {
  id: "mb_9",
  clientId: "cl_9",
  emailNormalized: "lucy@opensdoors.co.uk",
  provider: "MICROSOFT",
  workspaceRemovedAt: null,
  deletedAt: null,
  oauthState: "st_9",
  oauthStateExpiresAt: new Date("2026-08-28T12:15:00.000Z"),
};

const DURING_WINDOW = new Date("2026-08-28T12:05:00.000Z");

function callback(): Request {
  return new Request(
    "http://localhost:3000/api/mailbox-oauth/microsoft/callback?state=st_9&code=code_9",
  );
}

async function redirectQuery(res: Response): Promise<URLSearchParams> {
  const location = res.headers.get("location");
  expect(location, "handler did not redirect").toBeTruthy();
  return new URL(location!).searchParams;
}

describe("GET /api/mailbox-oauth/microsoft/callback", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(DURING_WINDOW);
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(MAILBOX);
    staffMock.mockResolvedValue({ id: "staff_1" });
    exchangeMock.mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
      scope: "graph",
    });
    resolveMock.mockResolvedValue({
      mailboxGraphUserId: "graph_lucy",
      oauthPrimaryEmail: "lucy@opensdoors.co.uk",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("refuses a state whose expiry has passed, with its own reason", async () => {
    vi.setSystemTime(new Date("2026-08-28T12:15:00.001Z"));

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("mailbox_oauth")).toBe("error");
    expect(q.get("reason")).toBe("expired_state");
    expect(q.get("oauth_mailbox_id")).toBe("mb_9");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(prismaMock.mailboxIdentitySecret.upsert).not.toHaveBeenCalled();
  });

  it("refuses a state row that carries no expiry at all", async () => {
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue({
      ...MAILBOX,
      oauthStateExpiresAt: null,
    });

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("expired_state");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("still connects a mailbox inside the window", async () => {
    const q = await redirectQuery(await GET(callback()));

    expect(q.get("mailbox_oauth")).toBe("connected");
    expect(q.get("oauth_mailbox_id")).toBe("mb_9");
    expect(prismaMock.mailboxIdentitySecret.upsert).toHaveBeenCalled();
  });

  /**
   * The expiry gate must not swallow the reason the operator actually needs
   * when the state is fine and something else went wrong.
   */
  it("keeps callback_failed for a failure inside the window", async () => {
    exchangeMock.mockRejectedValue(new Error("token endpoint said no"));

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("callback_failed");
  });

  /**
   * Tenant-wide admin consent comes back to this same URL with no state at all.
   * The gate sits after the state lookup, so it must not have touched this.
   */
  it("still shows the IT-admin consent page, which carries no state", async () => {
    const res = await GET(
      new Request(
        "http://localhost:3000/api/mailbox-oauth/microsoft/callback?admin_consent=True&tenant=t1",
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    await expect(res.text()).resolves.toContain("approved");
    expect(prismaMock.clientMailboxIdentity.findFirst).not.toHaveBeenCalled();
  });

  /**
   * End to end: take the redirect the handler really produced and read it the
   * way the mailboxes page reads it. A reason code nobody renders is a reason
   * code that does not exist.
   */
  it("renders, end to end, as a sentence telling the operator to press Connect", async () => {
    vi.setSystemTime(new Date("2026-08-29T09:00:00.000Z"));

    const res = await GET(callback());
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/clients/cl_9/mailboxes");

    const params = readMailboxOAuthSearchParams(
      Object.fromEntries(url.searchParams.entries()),
    );
    const banner = mailboxOAuthBanner({
      result: params.result,
      reason: params.reason,
      provider: "MICROSOFT",
      mailboxEmail: MAILBOX.emailNormalized,
      approvedEmail: params.approvedEmail,
      verifiedConnected: false,
      hasMailboxId: Boolean(params.mailboxId),
    });

    expect(banner!.type).toBe("err");
    expect(banner!.text).toMatch(/timed out/i);
    expect(banner!.text).toMatch(/press Connect/i);
  });
});
