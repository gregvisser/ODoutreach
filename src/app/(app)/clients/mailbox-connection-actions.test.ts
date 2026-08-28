import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Drives the real `prepareMailboxOAuthConnection` server action.
 *
 * The behaviour under test is a credential lifecycle, and it was a silent
 * outage: pressing Connect deleted the mailbox's stored refresh token and
 * flipped the row to PENDING_CONNECTION *before* the browser was redirected to
 * the provider. Sending gates on CONNECTED, so an operator who closed the tab
 * or wandered off took a working mailbox off the air and nothing said so.
 *
 * The unit tests on the rule itself live in
 * `src/lib/mailboxes/mailbox-connect-credential.test.ts`. These assert the
 * action actually applies it — this repository's most expensive recurring
 * defect is machinery that reports success without firing, and a rule that is
 * only tested in isolation is exactly that.
 */

const { prismaMock, auditMock, staffMock, mutatorMock, authorizeUrlMock, deleteMany, update } =
  vi.hoisted(() => {
    const deleteMany = vi.fn();
    const update = vi.fn();
    return {
      deleteMany,
      update,
      prismaMock: {
        clientMailboxIdentity: { findFirst: vi.fn(), update },
        mailboxIdentitySecret: { deleteMany },
        $transaction: vi.fn(
          async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
              clientMailboxIdentity: { update },
              mailboxIdentitySecret: { deleteMany },
            }),
        ),
      },
      auditMock: vi.fn(),
      staffMock: vi.fn(),
      mutatorMock: vi.fn(),
      authorizeUrlMock: vi.fn(),
    };
  });

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: staffMock }));
vi.mock("@/server/mailbox-identities/mutator-access", () => ({
  requireClientMailboxMutator: mutatorMock,
}));
vi.mock("@/server/mailbox/mailbox-connection-audit", () => ({
  auditMailboxConnectionChange: auditMock,
}));
vi.mock("@/server/mailbox/mailbox-primary-consistency", () => ({
  reconcilePrimaryMailboxForClient: vi.fn(),
}));
vi.mock("@/server/mailbox/mailbox-oauth-authorize-url", () => ({
  buildMailboxOAuthAuthorizeUrlForPreparedState: authorizeUrlMock,
}));
vi.mock("@/server/mailbox/oauth-env", () => ({
  isGoogleMailboxOAuthConfigured: () => true,
  isMicrosoftMailboxOAuthConfigured: () => true,
}));

import { prepareMailboxOAuthConnection } from "./mailbox-connection-actions";

type MailboxOverrides = {
  connectionStatus?: string;
  secret?: { id: string } | null;
  isActive?: boolean;
  workspaceRemovedAt?: Date | null;
};

function mailbox(over: MailboxOverrides = {}) {
  return {
    id: "mb_1",
    clientId: "cl_1",
    provider: "MICROSOFT",
    emailNormalized: "lucy@opensdoors.co.uk",
    connectionStatus: "CONNECTED",
    isActive: true,
    isPrimary: true,
    workspaceRemovedAt: null,
    deletedAt: null,
    secret: { id: "sec_1" },
    ...over,
  };
}

/** The single `clientMailboxIdentity.update` the prepare transaction issues. */
function preparedUpdateData(): Record<string, unknown> {
  expect(update).toHaveBeenCalledTimes(1);
  return update.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
  staffMock.mockResolvedValue({ id: "staff_1", isSuperAdmin: false });
  mutatorMock.mockResolvedValue(undefined);
  authorizeUrlMock.mockReturnValue("https://login.microsoftonline.com/authorize?x=1");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("prepareMailboxOAuthConnection — a mailbox that is sending today", () => {
  beforeEach(() => {
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(mailbox());
  });

  it("does NOT delete the stored credential before the operator has signed in", async () => {
    const res = await prepareMailboxOAuthConnection("cl_1", "mb_1");

    expect(res).toEqual({
      ok: true,
      startUrl: "https://login.microsoftonline.com/authorize?x=1",
    });
    // The whole defect in one assertion. This deleteMany used to be the first
    // statement in the transaction.
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("leaves the mailbox CONNECTED, so an abandoned reconnect does not stop it sending", async () => {
    await prepareMailboxOAuthConnection("cl_1", "mb_1");

    const data = preparedUpdateData();
    expect(data.connectionStatus).toBeUndefined();
    expect(data.providerLinkedUserId).toBeUndefined();
    expect(data.connectedAt).toBeUndefined();
  });

  it("still arms the OAuth state and expiry, so the callback can complete", async () => {
    await prepareMailboxOAuthConnection("cl_1", "mb_1");

    const data = preparedUpdateData();
    expect(typeof data.oauthState).toBe("string");
    expect((data.oauthState as string).length).toBeGreaterThan(0);
    expect(data.oauthStateExpiresAt).toBeInstanceOf(Date);
  });

  it("records the retention in the audit log, so it is checkable in production", async () => {
    await prepareMailboxOAuthConnection("cl_1", "mb_1");

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].metadata).toMatchObject({
      kind: "mailbox_oauth_prepare",
      beforeStatus: "CONNECTED",
      connectionStatus: "CONNECTED",
      credentialRetained: true,
    });
  });

  it("does not demote the mailbox when the sign-in URL cannot be built", async () => {
    authorizeUrlMock.mockImplementation(() => {
      throw new Error("no redirect URI");
    });

    const res = await prepareMailboxOAuthConnection("cl_1", "mb_1");

    expect(res.ok).toBe(false);
    // Two updates now: the prepare, then the failure. The failure records the
    // error and drops the in-flight state without touching the credential.
    expect(update).toHaveBeenCalledTimes(2);
    const failureData = update.mock.calls[1][0].data as Record<string, unknown>;
    expect(failureData.connectionStatus).toBeUndefined();
    expect(failureData.oauthState).toBeNull();
    expect(failureData.lastError).toContain("no redirect URI");
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("prepareMailboxOAuthConnection — a mailbox with nothing to protect", () => {
  it.each([
    ["DISCONNECTED", null],
    ["CONNECTION_ERROR", null],
    ["DRAFT", null],
  ] as const)(
    "still clears and moves %s to PENDING_CONNECTION",
    async (connectionStatus, secret) => {
      prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(
        mailbox({ connectionStatus, secret }),
      );

      await prepareMailboxOAuthConnection("cl_1", "mb_1");

      expect(deleteMany).toHaveBeenCalledWith({
        where: { mailboxIdentityId: "mb_1" },
      });
      const data = preparedUpdateData();
      expect(data.connectionStatus).toBe("PENDING_CONNECTION");
      expect(data.providerLinkedUserId).toBeNull();
      expect(data.connectedAt).toBeNull();
    },
  );

  it("clears a CONNECTED row whose credential has already gone, rather than claiming it can send", async () => {
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(
      mailbox({ secret: null }),
    );

    await prepareMailboxOAuthConnection("cl_1", "mb_1");

    expect(deleteMany).toHaveBeenCalled();
    expect(preparedUpdateData().connectionStatus).toBe("PENDING_CONNECTION");
    expect(auditMock.mock.calls[0][0].metadata).toMatchObject({
      beforeStatus: "CONNECTED",
      connectionStatus: "PENDING_CONNECTION",
      credentialRetained: false,
    });
  });
});
