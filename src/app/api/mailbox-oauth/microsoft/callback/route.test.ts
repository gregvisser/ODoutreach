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
import { MailboxOAuthFailure } from "@/server/mailbox/mailbox-oauth-callback-shared";

import { GET } from "./route";

/**
 * A row as `prepareMailboxOAuthConnection` really leaves it: state + expiry,
 * and — since cycle 73 — its CONNECTED status and stored secret intact for the
 * whole round trip.
 */
const MAILBOX = {
  id: "mb_9",
  clientId: "cl_9",
  emailNormalized: "lucy@opensdoors.co.uk",
  provider: "MICROSOFT",
  connectionStatus: "CONNECTED",
  isActive: true,
  secret: { id: "sec_9" },
  workspaceRemovedAt: null,
  deletedAt: null,
  oauthState: "st_9",
  oauthStateExpiresAt: new Date("2026-08-28T12:15:00.000Z"),
};

/** The same mailbox after its credential is gone — nothing left to protect. */
const MAILBOX_WITHOUT_CREDENTIAL = {
  ...MAILBOX,
  connectionStatus: "PENDING_CONNECTION",
  secret: null,
};

/** Every `data` object written to `clientMailboxIdentity.update` this test. */
function writtenRowData(): Record<string, unknown>[] {
  return prismaMock.update.mock.calls.map(
    (call) => (call[0] as { data: Record<string, unknown> }).data,
  );
}

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
   * when the state is fine and something else went wrong. An UNTAGGED error is
   * the one case that should still read as unclassified.
   */
  it("keeps callback_failed for an unclassified failure inside the window", async () => {
    exchangeMock.mockRejectedValue(new Error("socket hang up"));

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("callback_failed");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: "callback_failed",
          error: "socket hang up",
        }),
      }),
    );
  });

  /**
   * The row this cycle closes named BOTH callbacks. A fix proven on one of two
   * identical handlers is a fix proven on half the app, so the Microsoft route
   * gets the same two distinct failures asserted.
   */
  it("names a rejected token exchange rather than shrugging", async () => {
    exchangeMock.mockRejectedValue(
      new MailboxOAuthFailure(
        "token_exchange_rejected",
        "Microsoft token exchange failed: invalid_grant — expired",
      ),
    );

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("token_exchange_rejected");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outcome: "failed",
          reason: "token_exchange_rejected",
          error: "Microsoft token exchange failed: invalid_grant — expired",
        }),
      }),
    );
  });

  /**
   * The Microsoft-only failure: the sign-in is valid and is not the wrong
   * person either — the account simply has no rights over the target mailbox.
   * That is a mailbox-permissions job for the customer's IT administrator, and
   * reporting it as "sign-in did not finish" sent people back round a loop that
   * could never have worked.
   */
  it("names a mailbox the signed-in account cannot open", async () => {
    resolveMock.mockRejectedValue(
      new MailboxOAuthFailure(
        "mailbox_access_denied",
        "Microsoft sign-in (it@opensdoors.co.uk) cannot open lucy@opensdoors.co.uk in Microsoft Graph (HTTP 404).",
      ),
    );

    const res = await GET(callback());
    const q = await redirectQuery(res);
    expect(q.get("reason")).toBe("mailbox_access_denied");
    expect(prismaMock.mailboxIdentitySecret.upsert).not.toHaveBeenCalled();

    const params = readMailboxOAuthSearchParams(
      Object.fromEntries(new URL(res.headers.get("location")!).searchParams),
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
    expect(banner!.text).toContain("lucy@opensdoors.co.uk");
    expect(banner!.text).toMatch(/administrator/i);
    expect(banner!.text).not.toMatch(/did not finish/i);
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

  /**
   * The Google callback carries the same pair of tests and the same reasoning:
   * a failed sign-in ATTEMPT is not evidence about the refresh token already
   * stored for this mailbox, and `sending-policy.ts` gates on CONNECTED, so
   * writing CONNECTION_ERROR here stops a mailbox that was sending fine.
   *
   * Both providers go through one shared rule so they cannot drift, and both
   * are asserted, because "the other one is tested" is how a provider-specific
   * regression gets in.
   */
  it("leaves a sending mailbox sending when the token exchange is refused", async () => {
    exchangeMock.mockRejectedValue(
      new MailboxOAuthFailure(
        "token_exchange_rejected",
        "Microsoft token exchange failed: invalid_grant",
      ),
    );

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("token_exchange_rejected");
    for (const data of writtenRowData()) {
      expect(data).not.toHaveProperty("connectionStatus");
      expect(data).not.toHaveProperty("lastError");
      expect(data.oauthState).toBeNull();
      expect(data.oauthStateExpiresAt).toBeNull();
    }
    expect(writtenRowData()).toHaveLength(1);
    expect(prismaMock.mailboxIdentitySecret.upsert).not.toHaveBeenCalled();
  });

  /**
   * Entra's own error text is the sharpest reason not to write `lastError` on a
   * preserved row: `mailboxRowOperatorStatus` scans it AHEAD of the status
   * branches, so an `AADSTS500341` arriving in an `error_description` would
   * relabel a live, sending mailbox "Cannot be reconnected".
   */
  it("does not let a provider refusal relabel a live mailbox as unrecoverable", async () => {
    const q = await redirectQuery(
      await GET(
        new Request(
          "http://localhost:3000/api/mailbox-oauth/microsoft/callback?state=st_9" +
            "&error=invalid_grant&error_description=AADSTS500341%3A%20The%20user%20account%20is%20deleted",
        ),
      ),
    );

    expect(q.get("reason")).toBe("provider_denied");
    for (const data of writtenRowData()) {
      expect(data).not.toHaveProperty("lastError");
      expect(data).not.toHaveProperty("connectionStatus");
    }
  });

  it("still records the failure on a mailbox with no stored credential", async () => {
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(
      MAILBOX_WITHOUT_CREDENTIAL,
    );
    exchangeMock.mockRejectedValue(new Error("socket hang up"));

    await GET(callback());

    expect(writtenRowData()).toEqual([
      expect.objectContaining({
        connectionStatus: "CONNECTION_ERROR",
        lastError: "socket hang up",
      }),
    ]);
  });

  /**
   * Built, wired, reports success and never fires is this project's worst
   * defect class, so the decision is followed into the audit log an operator
   * can actually read after the fact.
   */
  it("records in the audit log whether the credential was kept", async () => {
    exchangeMock.mockRejectedValue(new Error("socket hang up"));
    await GET(callback());
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ credentialRetained: true }),
      }),
    );

    vi.clearAllMocks();
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(
      MAILBOX_WITHOUT_CREDENTIAL,
    );
    staffMock.mockResolvedValue({ id: "staff_1" });
    exchangeMock.mockRejectedValue(new Error("socket hang up"));
    await GET(callback());
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ credentialRetained: false }),
      }),
    );
  });
});
