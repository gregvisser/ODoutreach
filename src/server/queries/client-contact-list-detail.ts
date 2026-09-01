import "server-only";

import { prisma } from "@/lib/db";
import {
  deriveDeliveryStatus,
  deriveOpensLabel,
  summarizeDelivery,
  type DeliveryStatusLabel,
  type ListDeliverySummary,
} from "@/lib/lists/delivery-status";

export type ContactDeliveryRow = {
  contactId: string;
  name: string;
  employer: string | null;
  industry: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  country: string | null;
  linkedin: string | null;
  jobTitle: string | null;
  email: string | null;
  mobile: string | null;
  office: string | null;
  isSuppressed: boolean;
  sequenceName: string | null;
  stepName: string | null;
  mailboxLabel: string | null;
  subject: string | null;
  sendStatus: DeliveryStatusLabel;
  /**
   * Plain-English explanation of WHY this contact will not / did not
   * receive an email, when the status is a non-send state (Suppressed /
   * skipped, Awaiting send blocked, etc.). Null when there's nothing to
   * explain (e.g. already sent, or a clean awaiting-send).
   */
  skipReason: string | null;
  sentAt: Date | null;
  failedAt: Date | null;
  bounceStatus: string | null;
  repliedAt: Date | null;
  unsubscribedAt: Date | null;
  latestEventLabel: string | null;
  opensLabel: string;
  hasOutboundEmail: boolean;
  hasProviderProof: boolean;
  hasSentTimestamp: boolean;
  hasBounce: boolean;
  hasReply: boolean;
  hasUnsubscribe: boolean;
};

export type ContactListDetail = {
  listId: string;
  listName: string;
  clientId: string;
  clientName: string;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  totalContacts: number;
  contacts: ContactDeliveryRow[];
  summary: ListDeliverySummary;
};

/**
 * Load a single client contact list with per-contact delivery status.
 *
 * All queries are scoped by clientId for tenant isolation.
 * Never returns contacts from another client.
 * Read-only — no mutations.
 */
export async function loadClientContactListDetail(
  clientId: string,
  listId: string,
): Promise<ContactListDetail | null> {
  if (!clientId || !listId) return null;

  const list = await prisma.contactList.findFirst({
    where: { id: listId, clientId },
    select: {
      id: true,
      name: true,
      clientId: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      client: { select: { name: true } },
    },
  });

  if (!list || !list.clientId) return null;

  const members = await prisma.contactListMember.findMany({
    where: { contactListId: listId, clientId },
    select: {
      contactId: true,
      contact: {
        select: {
          id: true,
          email: true,
          fullName: true,
          firstName: true,
          lastName: true,
          company: true,
          title: true,
          industry: true,
          city: true,
          country: true,
          linkedIn: true,
          mobilePhone: true,
          officePhone: true,
          isSuppressed: true,
        },
      },
    },
    take: 5000,
  });

  if (members.length === 0) {
    return {
      listId: list.id,
      listName: list.name,
      clientId: list.clientId,
      clientName: list.client?.name ?? "—",
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      isArchived: list.archivedAt !== null,
      totalContacts: 0,
      contacts: [],
      summary: {
        totalContacts: 0,
        emailSendable: 0,
        sent: 0,
        awaitingSend: 0,
        queued: 0,
        sentProofMissing: 0,
        failed: 0,
        bounced: 0,
        replied: 0,
        unsubscribed: 0,
        suppressed: 0,
      },
    };
  }

  const contactIds = members.map((m) => m.contactId);

  const [stepSends, replies, unsubTokens] = await Promise.all([
    prisma.clientEmailSequenceStepSend.findMany({
      where: { contactListId: listId, clientId, contactId: { in: contactIds } },
      select: {
        contactId: true,
        status: true,
        blockedReason: true,
        outboundEmailId: true,
        subjectPreview: true,
        sequence: { select: { name: true } },
        step: {
          select: {
            template: { select: { name: true, category: true } },
          },
        },
        outboundEmail: {
          select: {
            id: true,
            status: true,
            sentAt: true,
            bouncedAt: true,
            openedAt: true,
            deliveredAt: true,
            failureReason: true,
            bounceCategory: true,
            lastProviderEventType: true,
            providerMessageId: true,
            mailbox: { select: { email: true, displayName: true } },
          },
        },
      },
    }),
    prisma.inboundReply.findMany({
      where: {
        clientId,
        contactId: { in: contactIds },
        matchMethod: { not: "UNLINKED" },
        linkedOutboundEmailId: { not: null },
      },
      select: {
        contactId: true,
        receivedAt: true,
        linkedOutboundEmailId: true,
      },
    }),
    prisma.unsubscribeToken.findMany({
      where: {
        clientId,
        contactId: { in: contactIds },
        usedAt: { not: null },
      },
      select: { contactId: true, usedAt: true },
    }),
  ]);

  const stepSendsByContact = new Map<string, (typeof stepSends)[number]>();
  for (const ss of stepSends) {
    const existing = stepSendsByContact.get(ss.contactId);
    if (!existing || sendPriority(ss.status) > sendPriority(existing.status)) {
      stepSendsByContact.set(ss.contactId, ss);
    }
  }

  const repliesByContact = new Map<string, Date>();
  for (const r of replies) {
    if (r.contactId) {
      const existing = repliesByContact.get(r.contactId);
      if (!existing || r.receivedAt > existing) {
        repliesByContact.set(r.contactId, r.receivedAt);
      }
    }
  }

  const unsubByContact = new Map<string, Date>();
  for (const u of unsubTokens) {
    if (u.contactId && u.usedAt) {
      const existing = unsubByContact.get(u.contactId);
      if (!existing || u.usedAt > existing) {
        unsubByContact.set(u.contactId, u.usedAt);
      }
    }
  }

  let emailSendableCount = 0;
  const contacts: ContactDeliveryRow[] = members.map((m) => {
    const c = m.contact;
    const ss = stepSendsByContact.get(c.id);
    const replyDate = repliesByContact.get(c.id) ?? null;
    const unsubDate = unsubByContact.get(c.id) ?? null;
    const hasEmail = Boolean(c.email?.trim());
    if (hasEmail && !c.isSuppressed) emailSendableCount++;

    const outbound = ss?.outboundEmail ?? null;

    const deliveryStatus = deriveDeliveryStatus({
      stepSendStatus: ss?.status ?? null,
      outboundStatus: outbound?.status ?? null,
      hasOutboundEmail: outbound !== null,
      hasProviderProof:
        Boolean(outbound?.providerMessageId) ||
        Boolean(outbound?.lastProviderEventType),
      sentAt: outbound?.sentAt ?? null,
      bouncedAt: outbound?.bouncedAt ?? null,
      openedAt: outbound?.openedAt ?? null,
      repliedAt: replyDate,
      unsubscribedAt: unsubDate,
      isSuppressed: c.isSuppressed,
      hasLinkedReply: replyDate !== null,
    });

    const skipReason = deriveSkipReason({
      deliveryStatus,
      blockedReason: ss?.blockedReason ?? null,
      failureReason: outbound?.failureReason ?? null,
      isSuppressed: c.isSuppressed,
      hasEmail,
    });

    const mailboxEmail = outbound?.mailbox?.email ?? null;
    const mailboxName = outbound?.mailbox?.displayName ?? null;
    const mailboxLabel =
      mailboxName?.trim() ? mailboxName : mailboxEmail;

    const name =
      c.fullName?.trim() ||
      [c.firstName, c.lastName].filter(Boolean).join(" ") ||
      c.email ||
      "—";

    return {
      contactId: c.id,
      name,
      employer: c.company ?? null,
      industry: c.industry ?? null,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      city: c.city ?? null,
      country: c.country ?? null,
      linkedin: c.linkedIn ?? null,
      jobTitle: c.title ?? null,
      email: c.email ?? null,
      mobile: c.mobilePhone ?? null,
      office: c.officePhone ?? null,
      isSuppressed: c.isSuppressed,
      sequenceName: ss?.sequence?.name ?? null,
      stepName: ss?.step?.template?.category ?? null,
      mailboxLabel: mailboxLabel ?? null,
      subject: ss?.subjectPreview ?? (outbound ? "Subject not captured" : null),
      sendStatus: deliveryStatus,
      skipReason,
      sentAt: outbound?.sentAt ?? null,
      failedAt: outbound?.failureReason ? (outbound.sentAt ?? null) : null,
      bounceStatus: outbound?.bounceCategory ?? null,
      repliedAt: replyDate,
      unsubscribedAt: unsubDate,
      latestEventLabel: outbound?.lastProviderEventType ?? null,
      opensLabel: deriveOpensLabel(outbound?.openedAt ?? null),
      hasOutboundEmail: outbound !== null,
      hasProviderProof:
        Boolean(outbound?.providerMessageId) ||
        Boolean(outbound?.lastProviderEventType),
      hasSentTimestamp: outbound?.sentAt !== null && outbound?.sentAt !== undefined,
      hasBounce: Boolean(outbound?.bouncedAt),
      hasReply: replyDate !== null,
      hasUnsubscribe: unsubDate !== null,
    };
  });

  const statuses = contacts.map((c) => c.sendStatus);

  return {
    listId: list.id,
    listName: list.name,
    clientId: list.clientId,
    clientName: list.client?.name ?? "—",
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    isArchived: list.archivedAt !== null,
    totalContacts: members.length,
    contacts,
    summary: summarizeDelivery(statuses, emailSendableCount),
  };
}

function sendPriority(status: string): number {
  switch (status) {
    case "SENT":
      return 6;
    case "FAILED":
      return 5;
    case "SUPPRESSED":
    case "BLOCKED":
    case "SKIPPED":
      return 4;
    case "READY":
      return 3;
    case "PLANNED":
      return 2;
    default:
      return 1;
  }
}

/**
 * Plain-English "why this contact isn't being emailed" line for the list
 * detail table. Only populated for non-send states so operators can see
 * exactly which addresses are excluded and why, without reading raw
 * status codes.
 */
function deriveSkipReason(input: {
  deliveryStatus: DeliveryStatusLabel;
  blockedReason: string | null;
  failureReason: string | null;
  isSuppressed: boolean;
  hasEmail: boolean;
}): string | null {
  if (input.deliveryStatus === "Suppressed / skipped") {
    if (input.blockedReason && input.blockedReason.trim()) {
      return humanizeStepSendBlockedReason(input.blockedReason.trim());
    }
    if (input.isSuppressed) {
      return "On the suppression list — will not be emailed.";
    }
    if (!input.hasEmail) {
      return "No email address on file.";
    }
    return "Skipped — not eligible for this send.";
  }
  if (input.deliveryStatus === "Failed") {
    return (
      input.failureReason?.trim() || "Send failed — see Activity for details."
    );
  }
  return null;
}

/** Map a persisted step-send blockedReason to staff-friendly copy. */
function humanizeStepSendBlockedReason(raw: string): string {
  const lower = raw.toLowerCase();
  // Cooldown reasons are already written for staff (they embed the
  // eligible-again date), so pass them straight through.
  if (lower.includes("cooldown") || lower.includes("recently contacted")) {
    return raw;
  }
  // Governance "client not active" gate — written when this row was last
  // checked before the client went live. Stale once the client activates (a
  // re-prepare clears it). Never show the raw "[blocked_client_inactive]" code.
  if (lower.includes("blocked_client_inactive") || lower.includes("not active")) {
    return "Last checked before the client went live — open the sequence in Outreach and use Review recipients to refresh.";
  }
  if (lower.includes("suppress")) {
    return "On the suppression list — will not be emailed.";
  }
  if (lower.includes("no email") || lower.includes("not email-sendable")) {
    return "No email address on file.";
  }
  if (lower.includes("not approved")) {
    return "Waiting on an approved email template.";
  }
  if (lower.includes("unsubscribe")) {
    return "Sender profile is missing an unsubscribe link.";
  }
  if (lower.includes("missing required sender") || lower.includes("required field")) {
    return "Sender profile is incomplete (a required field is missing).";
  }
  return raw;
}
