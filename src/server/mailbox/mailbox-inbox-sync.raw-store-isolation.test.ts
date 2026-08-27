import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * E-06 — one mailbox address on two workspaces must not put a verbatim copy of
 * that inbox into both.
 *
 * The leak is exactly one table. Replies and bounces were checked before this
 * test was written and both already refuse to cross: neither creates anything
 * without a matching outbound in the SAME client. So these tests assert two
 * things together, and the second matters as much as the first — the suppressed
 * workspace must lose the raw copy and KEEP its own replies. A fix that stopped
 * the second workspace syncing at all would pass a one-sided test and quietly
 * break a live client's reply ingestion.
 */

const { prismaMock, getMicrosoftTokenMock, listGraphMock, auditMock, replyMock, bounceMock } =
  vi.hoisted(() => ({
    prismaMock: {
      clientMailboxIdentity: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      inboundMailboxMessage: {
        upsert: vi.fn(),
      },
    },
    getMicrosoftTokenMock: vi.fn(),
    listGraphMock: vi.fn(),
    auditMock: vi.fn(),
    replyMock: vi.fn(),
    bounceMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({
  getMicrosoftGraphAccessTokenForMailbox: (...a: unknown[]) => getMicrosoftTokenMock(...a),
}));

// The mapper is deliberately NOT mocked: the test feeds a real Graph-shaped
// message through the shipped `mapGraphInboxMessageToRow` so the body it
// asserts about is the body production would have stored.
vi.mock("@/server/mailbox/microsoft-graph-inbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/mailbox/microsoft-graph-inbox")>();
  return { ...actual, listMicrosoftGraphInboxMessages: (...a: unknown[]) => listGraphMock(...a) };
});

vi.mock("@/server/mailbox/mailbox-connection-audit", () => ({
  auditMailboxConnectionChange: (...a: unknown[]) => auditMock(...a),
}));

vi.mock("@/server/mailbox/process-synced-replies", () => ({
  processSyncedMessageForReply: (...a: unknown[]) => replyMock(...a),
}));

vi.mock("@/server/mailbox/bounce-detection", () => ({
  processSyncedMessageForBounce: (...a: unknown[]) => bounceMock(...a),
}));

vi.mock("@/server/inbox/internal-domains", () => ({
  resolveInternalDomainsForClient: async () => [],
  isReplyThreadRefSenderGuardEnabled: () => false,
}));

import { syncMicrosoftInboxForMailbox } from "./mailbox-inbox-sync";

const SHARED_ADDRESS = "shared@acme-industrial.example";

/** The confidential half — a prospect's actual words, in the actual body. */
const PROSPECT_BODY = "Thanks for reaching out. Our budget for this sits with Priya, cc'd.";

const OWNER = {
  id: "mb-owner",
  clientId: "client-owner",
  emailNormalized: SHARED_ADDRESS,
  connectedAt: new Date("2026-01-05T09:00:00Z"),
  createdAt: new Date("2026-01-05T08:00:00Z"),
};

const SECOND = {
  id: "mb-second",
  clientId: "client-second",
  emailNormalized: SHARED_ADDRESS,
  connectedAt: new Date("2026-06-30T09:00:00Z"),
  createdAt: new Date("2026-06-30T08:00:00Z"),
};

function mailboxRow(row: typeof OWNER) {
  return {
    ...row,
    provider: "MICROSOFT" as const,
    connectionStatus: "CONNECTED" as const,
    workspaceRemovedAt: null,
    email: row.emailNormalized,
  };
}

function graphMessage() {
  return {
    id: "graph-msg-1",
    from: { emailAddress: { address: "prospect@buyer.example" } },
    toRecipients: [{ emailAddress: { address: SHARED_ADDRESS } }],
    subject: "Re: quick question",
    bodyPreview: PROSPECT_BODY.slice(0, 40),
    body: { contentType: "text", content: PROSPECT_BODY },
    receivedDateTime: "2026-08-01T10:00:00Z",
    internetMessageHeaders: [],
  };
}

function arrange(liveRowsForAddress: Array<typeof OWNER>, syncing: typeof OWNER) {
  prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(mailboxRow(syncing));
  prismaMock.clientMailboxIdentity.findMany.mockResolvedValue(liveRowsForAddress);
  prismaMock.clientMailboxIdentity.update.mockResolvedValue({});
  prismaMock.inboundMailboxMessage.upsert.mockResolvedValue({});
  listGraphMock.mockResolvedValue([graphMessage()]);
  getMicrosoftTokenMock.mockResolvedValue("access-token");
  bounceMock.mockResolvedValue({ suppressed: false, statusStamped: false });
  replyMock.mockResolvedValue({ created: true });
}

function run(syncing: typeof OWNER) {
  return syncMicrosoftInboxForMailbox({
    clientId: syncing.clientId,
    mailboxIdentityId: syncing.id,
    staffUserId: null,
  });
}

/** Every `bodyText` this sync wrote into the raw store, from the upsert calls. */
function storedBodies(): string[] {
  return prismaMock.inboundMailboxMessage.upsert.mock.calls.flatMap((call) => {
    const arg = call[0] as { create?: { bodyText?: string | null } };
    return arg.create?.bodyText ? [arg.create.bodyText] : [];
  });
}

describe("E-06: a mailbox shared by two workspaces stores its mail in only one", () => {
  beforeEach(() => {
    for (const m of [
      prismaMock.clientMailboxIdentity.findFirst,
      prismaMock.clientMailboxIdentity.findMany,
      prismaMock.clientMailboxIdentity.update,
      prismaMock.inboundMailboxMessage.upsert,
      getMicrosoftTokenMock,
      listGraphMock,
      auditMock,
      replyMock,
      bounceMock,
    ]) {
      m.mockReset();
    }
  });

  it("does NOT copy the prospect's message into the second workspace", async () => {
    arrange([OWNER, SECOND], SECOND);

    const result = await run(SECOND);

    expect(result.ok).toBe(true);
    // This is the whole defect in one assertion: the second workspace held a
    // verbatim copy of another client's prospect reply.
    expect(storedBodies()).not.toContain(PROSPECT_BODY);
    expect(prismaMock.inboundMailboxMessage.upsert).not.toHaveBeenCalled();
  });

  it("still matches the second workspace's OWN replies and bounces", async () => {
    arrange([OWNER, SECOND], SECOND);

    const result = await run(SECOND);

    expect(result.ok).toBe(true);
    // Reply matching and bounce detection are already client-scoped, so they
    // must keep running. Silencing them would break a live workspace.
    expect(replyMock).toHaveBeenCalledTimes(1);
    expect(bounceMock).toHaveBeenCalledTimes(1);
    if (result.ok) expect(result.repliesLinked).toBe(1);
  });

  it("keeps storing the mail in the workspace that had the address first", async () => {
    arrange([OWNER, SECOND], OWNER);

    const result = await run(OWNER);

    expect(result.ok).toBe(true);
    expect(storedBodies()).toContain(PROSPECT_BODY);
    expect(prismaMock.inboundMailboxMessage.upsert).toHaveBeenCalledTimes(1);
  });

  it("changes nothing for a mailbox that belongs to one workspace only", async () => {
    arrange([OWNER], OWNER);

    const result = await run(OWNER);

    expect(result.ok).toBe(true);
    expect(storedBodies()).toContain(PROSPECT_BODY);
    if (result.ok) expect(result.ingested).toBe(1);
  });
});
