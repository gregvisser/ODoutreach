import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Drives the real Google callback handler.
 *
 * The point of this test is the thing the app got wrong on 2026-08-28: Greg
 * approved Google consent as his own account while connecting a client's
 * mailbox, the guard correctly refused, and the refusal was flattened to
 * `callback_failed` and rendered as "Microsoft sign-in did not finish".
 *
 * `verifyGoogleMailboxOAuthForWorkspaceRow` is deliberately NOT mocked — the
 * real guard runs against a stubbed Gmail probe, so what is asserted is the
 * whole chain firing, not a stand-in for it.
 */

const { prismaMock, auditMock, staffMock, exchangeMock, profileMock } =
  vi.hoisted(() => {
    // One spy per table, shared between the top-level client and the
    // transaction handle, so assertions see writes made either way.
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
      profileMock: vi.fn(),
    };
  });

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/server/auth/staff", () => ({ tryGetOpensDoorsStaff: staffMock }));
vi.mock("@/server/mailbox/google-mailbox-oauth", () => ({
  exchangeGoogleMailboxAuthCode: exchangeMock,
  fetchGoogleUserEmailAndSub: profileMock,
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
 * A row as `prepareMailboxOAuthConnection` really leaves it: state + expiry.
 *
 * Since cycle 73 a mailbox that can send keeps its CONNECTED status AND its
 * stored secret for the whole round trip, so that — not a blank row — is what a
 * callback actually meets when an operator presses Connect on a live mailbox.
 */
const MAILBOX = {
  id: "mb_1",
  clientId: "cl_1",
  emailNormalized: "alex@trainhugger.com",
  provider: "GOOGLE",
  connectionStatus: "CONNECTED",
  isActive: true,
  secret: { id: "sec_1" },
  workspaceRemovedAt: null,
  deletedAt: null,
  oauthState: "st_1",
  oauthStateExpiresAt: new Date("2026-08-28T12:10:00.000Z"),
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

/** Inside the row's 15-minute window. */
const DURING_WINDOW = new Date("2026-08-28T12:05:00.000Z");

function callback(): Request {
  return new Request(
    "http://localhost:3000/api/mailbox-oauth/google/callback?state=st_1&code=code_1",
  );
}

/** Query on the redirect the operator's browser is sent to. */
async function redirectQuery(res: Response): Promise<URLSearchParams> {
  const location = res.headers.get("location");
  expect(location, "handler did not redirect").toBeTruthy();
  return new URL(location!).searchParams;
}

describe("GET /api/mailbox-oauth/google/callback", () => {
  beforeEach(() => {
    // Only `Date` is faked: the handler awaits real promises, and faking timers
    // wholesale would stall them.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(DURING_WINDOW);
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(MAILBOX);
    staffMock.mockResolvedValue({ id: "staff_1" });
    exchangeMock.mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
      scope: "gmail",
    });
    vi.stubGlobal("fetch", vi.fn() as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /**
   * The 15-minute `oauthStateExpiresAt` written by `prepareMailboxOAuthConnection`
   * was, until this test, written and never read: an abandoned Connect left a
   * live state in the database indefinitely.
   *
   * It gets its OWN reason code rather than reusing `unknown_state`, because a
   * link that has timed out and a link that was never issued are different
   * facts and the operator's next move differs. Reusing a code that means two
   * things is what cycle 56 spent itself unpicking.
   */
  it("refuses a state whose expiry has passed, with its own reason", async () => {
    vi.setSystemTime(new Date("2026-08-28T12:10:00.001Z"));

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("mailbox_oauth")).toBe("error");
    expect(q.get("reason")).toBe("expired_state");
    // Carried so the banner can name Google rather than guessing.
    expect(q.get("oauth_mailbox_id")).toBe("mb_1");
    // The refusal happens BEFORE the state is spent on anything.
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(prismaMock.mailboxIdentitySecret.upsert).not.toHaveBeenCalled();
  });

  it("accepts a state on the last millisecond before it expires", async () => {
    vi.setSystemTime(new Date("2026-08-28T12:10:00.000Z"));
    profileMock.mockResolvedValue({ email: "alex@trainhugger.com", sub: "s" });

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("mailbox_oauth")).toBe("connected");
  });

  /**
   * The only writer of a non-null `oauthState` always writes an expiry beside
   * it, so a null here means a row nothing in this codebase can produce. Refuse
   * it: a gate that waves through the state it cannot date is not a gate.
   */
  it("refuses a state row that carries no expiry at all", async () => {
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue({
      ...MAILBOX,
      oauthStateExpiresAt: null,
    });

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("expired_state");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("gives a wrong-account approval its own reason, carrying both addresses", async () => {
    // A row with no credential to protect, so the failure is recorded on it.
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(
      MAILBOX_WITHOUT_CREDENTIAL,
    );
    profileMock.mockResolvedValue({
      email: "greg.visser64@gmail.com",
      sub: "sub_greg",
    });
    // Gmail refuses the probe: this sign-in cannot act for the row mailbox.
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403 }));

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("mailbox_oauth")).toBe("error");
    expect(q.get("reason")).toBe("oauth_account_mismatch");
    expect(q.get("oauth_actor")).toBe("greg.visser64@gmail.com");
    // Without this the page cannot know the row's provider and guesses.
    expect(q.get("oauth_mailbox_id")).toBe("mb_1");

    // The operator-facing reason is also stored on the row, in the same words.
    expect(prismaMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          connectionStatus: "CONNECTION_ERROR",
          lastError:
            "You approved as greg.visser64@gmail.com, but this mailbox is alex@trainhugger.com. " +
            "Sign in as alex@trainhugger.com, or ask that person to connect their own mailbox.",
        }),
      }),
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outcome: "account_mismatch",
          oauthActorEmail: "greg.visser64@gmail.com",
        }),
      }),
    );
    expect(prismaMock.mailboxIdentitySecret.upsert).not.toHaveBeenCalled();
  });

  /**
   * The catch-all this row exists to remove. Every exception in the callback
   * used to redirect with `callback_failed`, so the operator was told something
   * broke and given nothing to act on. The reason now travels from the throw
   * site that knows the cause.
   */
  it("names a rejected token exchange, and leaks no address", async () => {
    exchangeMock.mockRejectedValue(
      new MailboxOAuthFailure(
        "token_exchange_rejected",
        "Google token exchange failed: invalid_grant — Bad Request",
      ),
    );

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("mailbox_oauth")).toBe("error");
    expect(q.get("reason")).toBe("token_exchange_rejected");
    expect(q.get("oauth_actor")).toBeNull();
    expect(q.get("oauth_mailbox_id")).toBe("mb_1");
    // The audit row records WHICH failure and the provider's own words, not
    // just `outcome: failed`.
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outcome: "failed",
          reason: "token_exchange_rejected",
          error: "Google token exchange failed: invalid_grant — Bad Request",
        }),
      }),
    );
  });

  /**
   * The second distinct failure the row asks for. Google returning no refresh
   * token is a DIFFERENT operator action from a rejected exchange — the person
   * has to revoke the app's previous grant and approve offline access again —
   * so it must not share a reason code with it.
   */
  it("names a missing refresh token as its own reason", async () => {
    exchangeMock.mockResolvedValue({ access_token: "at", expires_in: 3600 });

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("no_refresh_token");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outcome: "failed",
          reason: "no_refresh_token",
        }),
      }),
    );
    expect(prismaMock.mailboxIdentitySecret.upsert).not.toHaveBeenCalled();
  });

  /**
   * An untagged error — a Prisma outage, a bug — still has to land somewhere.
   * `callback_failed` remains the floor, so nothing is ever swallowed silently
   * just because it was not anticipated.
   */
  it("still falls back to callback_failed for an unclassified error", async () => {
    exchangeMock.mockRejectedValue(new Error("socket hang up"));

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("callback_failed");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outcome: "failed",
          reason: "callback_failed",
          error: "socket hang up",
        }),
      }),
    );
  });

  /**
   * Built, wired and never fires is this project's worst defect class, so the
   * reason is followed all the way to the sentence on the page — two failures,
   * two different sentences, neither of them the old shrug.
   */
  it("renders each failure as a different, actionable sentence", async () => {
    const sentenceFor = async (thrown: unknown): Promise<string> => {
      exchangeMock.mockRejectedValue(thrown);
      const res = await GET(callback());
      const params = readMailboxOAuthSearchParams(
        Object.fromEntries(new URL(res.headers.get("location")!).searchParams),
      );
      const banner = mailboxOAuthBanner({
        result: params.result,
        reason: params.reason,
        provider: "GOOGLE",
        mailboxEmail: "alex@trainhugger.com",
        approvedEmail: params.approvedEmail,
        verifiedConnected: false,
        hasMailboxId: Boolean(params.mailboxId),
      });
      expect(banner?.type).toBe("err");
      return banner!.text;
    };

    const rejected = await sentenceFor(
      new MailboxOAuthFailure("token_exchange_rejected", "invalid_grant"),
    );
    const misconfigured = await sentenceFor(
      new MailboxOAuthFailure(
        "oauth_app_misconfigured",
        "Google mailbox OAuth client is not configured",
      ),
    );

    expect(rejected).not.toBe(misconfigured);
    for (const text of [rejected, misconfigured]) {
      expect(text).not.toMatch(/did not finish/i);
      expect(text).not.toMatch(/microsoft/i);
    }
    // The one an operator cannot fix alone must say so rather than send them
    // round the Connect loop again.
    expect(misconfigured).toMatch(/administrator/i);
    expect(rejected).toMatch(/Connect/);
  });

  it("connects when the approving account IS the mailbox", async () => {
    profileMock.mockResolvedValue({
      email: "Alex@TrainHugger.com",
      sub: "sub_alex",
    });

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("mailbox_oauth")).toBe("connected");
    expect(q.get("oauth_mailbox_id")).toBe("mb_1");
    expect(q.get("reason")).toBeNull();
    // Same-address path must not need the Gmail probe at all.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(prismaMock.mailboxIdentitySecret.upsert).toHaveBeenCalled();
  });

  /**
   * The two halves above can each be right while the operator still sees
   * nothing — this project's most common defect by a distance is a thing that
   * is built, wired, reports success and never fires. So: take the redirect the
   * handler really produced, read it the way the mailboxes page reads it, and
   * check the sentence that comes out the far end.
   */
  it("renders, end to end, as the sentence the operator needs", async () => {
    profileMock.mockResolvedValue({
      email: "greg.visser64@gmail.com",
      sub: "sub_greg",
    });
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403 }));

    const res = await GET(callback());
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/clients/cl_1/mailboxes");

    const params = readMailboxOAuthSearchParams(
      Object.fromEntries(url.searchParams.entries()),
    );
    // The page looks the row up by params.mailboxId — provider and address come
    // from the database, never from the URL.
    const banner = mailboxOAuthBanner({
      result: params.result,
      reason: params.reason,
      provider: "GOOGLE",
      mailboxEmail: "alex@trainhugger.com",
      approvedEmail: params.approvedEmail,
      verifiedConnected: false,
      hasMailboxId: Boolean(params.mailboxId),
    });

    expect(banner).toEqual({
      type: "err",
      text:
        "You approved as greg.visser64@gmail.com, but this mailbox is alex@trainhugger.com. " +
        "Sign in as alex@trainhugger.com, or ask that person to connect their own mailbox.",
    });
    expect(banner!.text).not.toMatch(/microsoft/i);
  });

  it("tells the operator which mailbox a provider refusal was for", async () => {
    const res = await GET(
      new Request(
        "http://localhost:3000/api/mailbox-oauth/google/callback?state=st_1&error=access_denied",
      ),
    );
    const q = await redirectQuery(res);

    expect(q.get("reason")).toBe("provider_denied");
    expect(q.get("oauth_mailbox_id")).toBe("mb_1");
  });

  /**
   * Cycle 73 stopped Connect deleting a working credential on the way OUT. This
   * is the same rule on the way BACK IN: a sign-in attempt that fails is not
   * evidence about the refresh token already stored for this mailbox, and
   * `sending-policy.ts` gates on `connectionStatus === "CONNECTED"`, so writing
   * CONNECTION_ERROR here silently stops a mailbox that was sending fine.
   *
   * The wrong-account case is the proof the queue item asks for, because it is
   * the one where the stored credential is DEFINITELY still good: the exchange
   * succeeded, and the only thing that went wrong is who was at the keyboard.
   */
  it("leaves a sending mailbox sending when the wrong account approves", async () => {
    profileMock.mockResolvedValue({
      email: "greg.visser64@gmail.com",
      sub: "sub_greg",
    });
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403 }));

    const q = await redirectQuery(await GET(callback()));

    // The operator is told, in the same words as before.
    expect(q.get("reason")).toBe("oauth_account_mismatch");
    expect(q.get("oauth_actor")).toBe("greg.visser64@gmail.com");

    // But nothing about the mailbox's ability to send is touched. Absent keys,
    // not null ones: Prisma leaves an omitted column alone, null would erase.
    for (const data of writtenRowData()) {
      expect(data).not.toHaveProperty("connectionStatus");
      expect(data).not.toHaveProperty("lastError");
      // The spent state still has to go, preserved or not.
      expect(data.oauthState).toBeNull();
      expect(data.oauthStateExpiresAt).toBeNull();
    }
    expect(writtenRowData()).toHaveLength(1);
    expect(prismaMock.mailboxIdentitySecret.upsert).not.toHaveBeenCalled();
  });

  it("leaves a sending mailbox sending when the token exchange is refused", async () => {
    exchangeMock.mockRejectedValue(
      new MailboxOAuthFailure(
        "token_exchange_rejected",
        // At a callback this is a fact about the AUTHORIZATION CODE — spent,
        // expired, wrong redirect URI — not about the stored refresh token.
        // Handing it to `classifyMailboxCredentialFailure` would read it as
        // "reconnect required" and demote the mailbox on the wrong evidence.
        "Google token exchange failed: invalid_grant — Bad Request",
      ),
    );

    const q = await redirectQuery(await GET(callback()));

    expect(q.get("reason")).toBe("token_exchange_rejected");
    for (const data of writtenRowData()) {
      expect(data).not.toHaveProperty("connectionStatus");
      expect(data).not.toHaveProperty("lastError");
    }
  });

  /**
   * The operator pressing Deny at Google says nothing about the credential this
   * mailbox already holds either.
   */
  it("leaves a sending mailbox sending when the operator declines at Google", async () => {
    const q = await redirectQuery(
      await GET(
        new Request(
          "http://localhost:3000/api/mailbox-oauth/google/callback?state=st_1&error=access_denied",
        ),
      ),
    );

    expect(q.get("reason")).toBe("provider_denied");
    for (const data of writtenRowData()) {
      expect(data).not.toHaveProperty("connectionStatus");
      expect(data).not.toHaveProperty("lastError");
    }
  });

  /**
   * The other half of the rule, and the reason it is not simply "never write".
   * A row with nothing left to send with gets the failure recorded, exactly as
   * it always did — otherwise a stranded mailbox goes on reading "Connected"
   * with no explanation anywhere on the row.
   */
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
});
