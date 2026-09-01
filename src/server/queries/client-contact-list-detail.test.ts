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
      id: `out-${contactId}`,
      status: "SENT",
      sentAt: new Date("2026-05-10T09:00:00Z"),
      bouncedAt: null,
      openedAt: null,
      deliveredAt: null,
      failureReason: null,
      bounceCategory: null,
      lastProviderEventType: "delivered",
      providerMessageId: "msg-123",
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

  it("returns contacts with 'Sent from mailbox' when step send is SENT with proof", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([makeStepSend("c1")]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result).not.toBeNull();
    expect(result!.contacts).toHaveLength(1);
    expect(result!.contacts[0].sendStatus).toBe("Sent from mailbox");
    expect(result!.contacts[0].sequenceName).toBe("Proof Sequence");
    expect(result!.contacts[0].mailboxLabel).toBe("Sender");
    expect(result!.contacts[0].hasOutboundEmail).toBe(true);
    expect(result!.contacts[0].hasProviderProof).toBe(true);
    expect(result!.contacts[0].hasSentTimestamp).toBe(true);
  });

  it("returns 'Bounced' when outbound is BOUNCED", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        outboundEmail: {
          id: "out-c1",
          status: "BOUNCED",
          sentAt: new Date(),
          bouncedAt: new Date(),
          openedAt: null,
          deliveredAt: null,
          failureReason: null,
          bounceCategory: "hard",
          lastProviderEventType: "bounced",
          providerMessageId: "msg-c1",
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

  it("humanizes a stale 'client not active' block — no raw code leaks to staff", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        status: "BLOCKED",
        outboundEmail: null,
        outboundEmailId: null,
        blockedReason:
          "[blocked_client_inactive] Client is ONBOARDING, not ACTIVE — activate the client before launching live sequences. Blocked from live sending — check client status and dispatch requirements.",
      }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    const contact = result!.contacts[0];
    expect(contact.sendStatus).toBe("Suppressed / skipped");
    // The raw internal code / governance string must never reach staff.
    expect(contact.skipReason).not.toMatch(/blocked_client_inactive/i);
    expect(contact.skipReason).not.toMatch(/dispatch requirements/i);
    expect(contact.skipReason).toMatch(/before the client went live/i);
    expect(contact.skipReason).toMatch(/Review recipients/i);
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
          id: "out-c1",
          status: "FAILED",
          sentAt: null,
          bouncedAt: null,
          openedAt: null,
          deliveredAt: null,
          failureReason: "Provider rejected",
          bounceCategory: null,
          lastProviderEventType: "failed",
          providerMessageId: null,
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

  // --- PR #132 send-proof tests ---

  it("returns 'Sent, not confirmed' when step-send SENT but no OutboundEmail", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        status: "SENT",
        outboundEmailId: null,
        outboundEmail: null,
      }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Sent, not confirmed");
    expect(result!.contacts[0].hasOutboundEmail).toBe(false);
    expect(result!.summary.sentProofMissing).toBe(1);
    expect(result!.summary.sent).toBe(0);
  });

  it("returns 'Sent — time unavailable' when step-send SENT with providerMessageId but no sentAt", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        outboundEmail: {
          id: "out-c1",
          status: "SENT",
          sentAt: null,
          bouncedAt: null,
          openedAt: null,
          deliveredAt: null,
          failureReason: null,
          bounceCategory: null,
          lastProviderEventType: null,
          providerMessageId: "msg-456",
          mailbox: { email: "sender@opensdoors.com", displayName: null },
        },
      }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Sent — time unavailable");
    expect(result!.contacts[0].hasOutboundEmail).toBe(true);
    expect(result!.contacts[0].hasProviderProof).toBe(true);
    expect(result!.contacts[0].hasSentTimestamp).toBe(false);
  });

  it("shows send proof details in contact row", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([makeStepSend("c1")]);
    inboundReplyFindMany.mockResolvedValueOnce([
      { contactId: "c1", receivedAt: new Date(), linkedOutboundEmailId: "out-c1" },
    ]);
    unsubscribeTokenFindMany.mockResolvedValueOnce([
      { contactId: "c1", usedAt: new Date() },
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    const contact = result!.contacts[0];
    expect(contact.hasOutboundEmail).toBe(true);
    expect(contact.hasProviderProof).toBe(true);
    expect(contact.hasSentTimestamp).toBe(true);
    expect(contact.hasReply).toBe(true);
    expect(contact.hasUnsubscribe).toBe(true);
  });

  // --- PR #133 QUEUED status tests ---

  it("returns 'Queued' when outbound status is QUEUED (not 'Sent, not confirmed')", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        status: "SENT",
        outboundEmail: {
          id: "out-c1",
          status: "QUEUED",
          sentAt: null,
          bouncedAt: null,
          openedAt: null,
          deliveredAt: null,
          failureReason: null,
          bounceCategory: null,
          lastProviderEventType: null,
          providerMessageId: null,
          mailbox: { email: "sender@opensdoors.com", displayName: null },
        },
      }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Queued");
    expect(result!.summary.queued).toBe(1);
    expect(result!.summary.sent).toBe(0);
    expect(result!.summary.sentProofMissing).toBe(0);
  });

  it("returns 'Queued' when outbound status is PROCESSING", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", {
        status: "SENT",
        outboundEmail: {
          id: "out-c1",
          status: "PROCESSING",
          sentAt: null,
          bouncedAt: null,
          openedAt: null,
          deliveredAt: null,
          failureReason: null,
          bounceCategory: null,
          lastProviderEventType: null,
          providerMessageId: null,
          mailbox: { email: "sender@opensdoors.com", displayName: null },
        },
      }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    expect(result!.contacts[0].sendStatus).toBe("Queued");
  });

  // Row 152 (raised by row 135/cycle195 finding 3): the expanded contact
  // row's "Subject" field fell back to the mailbox's own email address
  // when no subject preview was captured — reading as a data bug to
  // anyone who expanded that row, since it looked like the subject line
  // literally was the sender's own address.
  it("does not fall back to the mailbox address for Subject when no subject preview was captured (row 152)", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([makeMember("c1")]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1", { subjectPreview: null }),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    const subject = result!.contacts[0].subject;
    expect(subject).not.toBe("sender@opensdoors.com");
    expect(subject).toMatch(/not captured/i);
  });

  it("joins by contactId not name — duplicate names do not steal proof", async () => {
    contactListFindFirst.mockResolvedValueOnce(makeList());
    contactListMemberFindMany.mockResolvedValueOnce([
      makeMember("c1", { fullName: "Same Name" }),
      makeMember("c2", { fullName: "Same Name" }),
    ]);
    stepSendFindMany.mockResolvedValueOnce([
      makeStepSend("c1"),
    ]);

    const result = await loadClientContactListDetail(CLIENT, LIST);
    const c1 = result!.contacts.find((c) => c.contactId === "c1");
    const c2 = result!.contacts.find((c) => c.contactId === "c2");
    expect(c1!.sendStatus).toBe("Sent from mailbox");
    expect(c2!.sendStatus).toBe("Not sent");
    expect(c2!.hasOutboundEmail).toBe(false);
  });
});
