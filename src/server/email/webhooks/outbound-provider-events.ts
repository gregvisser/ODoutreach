import "server-only";

import { prisma } from "@/lib/db";

import {
  mapEventTypeToKind,
  planWebhookMutation,
} from "@/server/email/outbound/lifecycle";

import { computeWebhookDedupeHash } from "./webhook-dedupe";

export type NormalizedEmailEvent = {
  providerName: string;
  providerMessageId: string;
  eventType: string;
  createdAt: Date;
  bounceCategory?: string | null;
  providerStatus?: string | null;
  rawPayload: unknown;
  /** Svix `svix-id` — preferred replay key */
  webhookMessageId?: string | null;
};

/**
 * Inserts audit row (deduped), then optionally mutates outbound. Replays with the same
 * `dedupeHash` do not change outbound state twice.
 */
export async function applyNormalizedEmailEvent(
  event: NormalizedEmailEvent,
): Promise<{
  applied: boolean;
  outboundEmailId?: string;
  replayDuplicate?: boolean;
}> {
  const dedupeHash = computeWebhookDedupeHash({
    providerName: event.providerName,
    webhookMessageId: event.webhookMessageId,
    eventType: event.eventType,
    providerMessageId: event.providerMessageId,
  });

  try {
    await prisma.outboundProviderEvent.create({
      data: {
        clientId: null,
        outboundEmailId: null,
        providerName: event.providerName,
        eventType: event.eventType,
        providerMessageId: event.providerMessageId,
        webhookMessageId: event.webhookMessageId?.trim() ?? null,
        dedupeHash,
        payload: event.rawPayload as object,
        receivedAt: new Date(),
        replayDuplicate: false,
        stateMutated: false,
      },
    });
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { applied: false, replayDuplicate: true };
    }
    throw e;
  }

  const outbound = await prisma.outboundEmail.findFirst({
    where: { providerMessageId: event.providerMessageId },
    select: {
      id: true,
      clientId: true,
      status: true,
      lastProviderEventAt: true,
    },
  });

  await prisma.outboundProviderEvent.updateMany({
    where: { dedupeHash },
    data: {
      clientId: outbound?.clientId ?? null,
      outboundEmailId: outbound?.id ?? null,
    },
  });

  if (!outbound) {
    await prisma.outboundProviderEvent.updateMany({
      where: { dedupeHash },
      data: {
        processingNote: "no_outbound_match_for_provider_message_id",
      },
    });
    return { applied: false };
  }

  const kind = mapEventTypeToKind(event.eventType);
  const plan = planWebhookMutation({
    currentStatus: outbound.status,
    kind,
    eventCreatedAt: event.createdAt,
    lastProviderEventAt: outbound.lastProviderEventAt,
  });

  if (plan.mode === "skip") {
    await prisma.outboundProviderEvent.updateMany({
      where: { dedupeHash },
      data: {
        processingNote: plan.reason,
        stateMutated: false,
      },
    });
    return { applied: true, outboundEmailId: outbound.id };
  }

  const baseMeta = {
    lastProviderEventType: event.eventType,
    providerStatus: event.providerStatus ?? event.eventType,
    lastProviderEventAt: event.createdAt,
  };

  if (plan.mode === "metadata_only") {
    await prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        ...baseMeta,
        ...(kind === "delivered" && outbound.status === "REPLIED"
          ? { deliveredAt: event.createdAt }
          : {}),
      },
    });
    await prisma.outboundProviderEvent.updateMany({
      where: { dedupeHash },
      data: { stateMutated: true, processingNote: plan.reason },
    });
    return { applied: true, outboundEmailId: outbound.id };
  }

  if (kind === "delivered") {
    await prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        status: "DELIVERED",
        deliveredAt: event.createdAt,
        ...baseMeta,
      },
    });
  } else if (kind === "bounced") {
    await prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        status: "BOUNCED",
        bouncedAt: event.createdAt,
        bounceCategory: event.bounceCategory ?? null,
        ...baseMeta,
      },
    });
  } else if (kind === "failed" || kind === "complained") {
    await prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        status: "FAILED",
        lastErrorMessage:
          kind === "complained"
            ? `Complaint: ${event.eventType}`
            : `Provider event: ${event.eventType}`,
        lastErrorCode: kind === "complained" ? "COMPLAINT" : "PROVIDER_EVENT",
        ...baseMeta,
      },
    });
  } else if (kind === "delayed") {
    await prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        providerStatus: "deferred",
        lastProviderEventType: event.eventType,
        lastProviderEventAt: event.createdAt,
      },
    });
  } else {
    await prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: baseMeta,
    });
  }

  await prisma.outboundProviderEvent.updateMany({
    where: { dedupeHash },
    data: { stateMutated: true, processingNote: plan.reason },
  });

  return { applied: true, outboundEmailId: outbound.id };
}
