import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  contactListFindFirst,
  contactListMemberFindMany,
  stepSendFindMany,
  inboundReplyFindMany,
  unsubscribeTokenFindMany,
} = vi.hoisted(() => ({
  contactListFindFirst: vi.fn().mockResolvedValue(null),
  contactListMemberFindMany: vi.fn().mockResolvedValue([]),
  stepSendFindMany: vi.fn().mockResolvedValue([]),
  inboundReplyFindMany: vi.fn().mockResolvedValue([]),
  unsubscribeTokenFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    contactList: { findFirst: contactListFindFirst },
    contactListMember: { findMany: contactListMemberFindMany },
    clientEmailSequenceStepSend: { findMany: stepSendFindMany },
    inboundReply: { findMany: inboundReplyFindMany },
    unsubscribeToken: { findMany: unsubscribeTokenFindMany },
  },
}));

import { loadClientContactListDetail } from "./client-contact-list-detail";

const CLIENT = "client-1";
const LIST = "list-1";

function makeList(overrides: Record<string, unknown> = {}) {
  return {
    id: LIST,
    name: "Production Proof List",
    clientId: CLIENT,
    archivedAt: null,
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-10"),
    client: { name: "Test Corp" },
    ...overrides,
  };
}

function makeMember(contactId: string, contactOverrides: Record<string, unknown> = {}) {
  return {
    contactId,
    contact: {
      id: contactId,
      email: `${contactId}@corp.com`,
      fullName: `Contact ${contactId}`,
      firstName: "First",
      lastName: "Last",
      company: "Corp Inc",
      title: "Manager",
      industry: "Tech",
      city: "London",
      country: "UK",
      linkedIn: null,
      mobilePhone: null,
      officePhone: null,
      isSuppressed: false,
      ...contactOverrides,
    },
  };
}

function makeStepSend(contactId: string, overrides: Record<string, unknown> = {}) {
  return {
    contactId,
    status: "SENT",
    outboundEmailId: `out-${contactId}`,
    subjectPreview: "Introduction from OpensDoors",
    sequence: { name: "Proof Sequence" },
    step: { template: { name: "Intro", category: "INTRODUCTION" } },
    outboundEmail: {
      status: "SENT",
      sentAt: new Date("2026-05-10T09:00:00Z"),
      bouncedAt: null,
      openedAt: null,
      deliveredAt: null,
      failureReason: null,
      bounceCategory: null,
      lastProviderEventType: "delivered",
      mailbox: { email: "sender@opensdoors.com", displayName: "Sender" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadClientContactListDetail", () => {
  it("returns null for empty clientId", async () => {
    const result = await loadClientContactListDetail("", LIST);
    expect(result).toBeNull();
    expect(contactListFindFirst).not.toHaveBeenCalled();
  });

  it("returns null for empty listId", async () => {
    const result = await loadClientContactListDetail(CLIENT, "");
    expect(result).toBeNull();
  });

  it("returns null when list not found", async () => {
    contactListFindFirst.mockResolvedValueOnce(null);
    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result).toBeNull();
  });

  it("returns empty detail for list with no members", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result).not.toBeNull();
    expect(result!.listName).toBe("Production Proof List");
    expect(result!.clientName).toBe("Test Corp");
    expect(result!.totalContacts).toBe(0);
    expect(result!.contacts).toHaveLength(0);
    expect(result!.summary.totalContacts).toBe(0);
  });

  it("returns contacts with 'Sent from mailbox' when step send is SENT", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([makeStepSend("c1")]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result).not.toBeNull();
    expect(result!.contacts).toHaveLength(1);
    expect(result!.contacts[0].sendStatus).toBe("Sent from mailbox");
    expect(result!.contacts[0].sequenceName).toBe("Proof Sequence");
    expect(result!.contacts[0].mailboxLabel).toBe("Sender");
  });

  it("returns 'Bounced' when outbound is BOUNCED", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        outboundEmail: {
          status: "BOUNCED",
          sentAt: new Date(),
          bouncedAt: new Date(),
          openedAt: null,
          deliveredAt: null,
          failureReason: null,
          bounceCategory: "hard",
          lastProviderEventType: "bounced",
          mailbox: { email: "sender@opensdoors.com", displayName: null },
        },
      }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Bounced");
    expect(result!.summary.bounced).toBe(1);
  });

  it("returns 'Replied' when linked reply exists", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([makeStepSend("c1")]);
    inboundReplyFindMany.mockResolvedValueOnce([
      { contactId: "c1", receivedAt: new Date(), linkedOutboundEmailId: "out-c1" },
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Replied");
    expect(result!.summary.replied).toBe(1);
  });

  it("returns 'Unsubscribed' when unsub token is used", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([makeStepSend("c1")]);
    unsubscribeTokenFindMany.mockResolvedValueOnce([
      { contactId: "c1", usedAt: new Date() },
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Unsubscribed");
    expect(result!.summary.unsubscribed).toBe(1);
  });

  it("returns 'Suppressed / skipped' for SUPPRESSED step send", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        status: "SUPPRESSED",
        outboundEmail: null,
        outboundEmailId: null,
      }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Suppressed / skipped");
    expect(result!.summary.suppressed).toBe(1);
  });

  it("returns 'Not sent' when no step send exists", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Not sent");
  });

  it("opensLabel is 'Not tracked' when openedAt is null", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([makeStepSend("c1")]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].opensLabel).toBe("Not tracked");
  });

  it("shows archived notice for archived list", async () => {
    contactListFindFirst.mockResolvedValueOnce(
      makeList({ archivedAt: new Date() }),
    );
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([makeStepSend("c1")]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.isArchived).toBe(true);
  });

  it("scopes query to clientId — verifies findFirst where clause", async () => {
    contactListFindFirst.mockResolvedValueOnce(null);
    await loadClientContactListDetail(CLIENT, LIST);

    expect(contactListFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LIST, clientId: CLIENT },
      }),
    );
  });

  it("excludes contacts from other clients via contactListMember where clause", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([]);

    await loadClientContactListDetail(CLIENT, LIST);

    expect(contactListMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contactListId: LIST, clientId: CLIENT },
      }),
    );
  });

  it("does not execute any write/send operations", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([
      makeMember("c1"),
      makeMember("c2"),
    ]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1"),
      makeStepSend("c2"),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result).not.toBeNull();
    expect(result!.contacts).toHaveLength(2);
  });

  it("returns 'Failed' for FAILED outbound", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        status: "FAILED",
        outboundEmail: {
          status: "FAILED",
          sentAt: null,
          bouncedAt: null,
          openedAt: null,
          deliveredAt: null,
          failureReason: "Provider rejected",
          bounceCategory: null,
          lastProviderEventType: "failed",
          mailbox: { email: "sender@opensdoors.com", displayName: null },
        },
      }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Failed");
    expect(result!.summary.failed).toBe(1);
  });

  it("counts email-sendable contacts correctly", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([
      makeMember("c1"),
      makeMember("c2", { email: null }),
      makeMember("c3", { isSuppressed: true }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.summary.emailSendable).toBe(1);
    expect(result!.summary.totalContacts).toBe(3);
  });
});
