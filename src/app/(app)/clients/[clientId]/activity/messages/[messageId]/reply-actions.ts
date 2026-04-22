"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  fetchInboundMessageFullBody,
  type FetchInboundFullBodyResult,
} from "@/server/inbox/fetch-inbound-message-full-body";
import { markInboundMailboxMessageHandled } from "@/server/inbox/mark-inbound-message-handled";
import {
  replyToInboundMailboxMessage,
  type ReplyToInboundMessageResult,
} from "@/server/inbox/reply-to-inbound-message";

/**
 * PR J — operator sends a reply to an InboundMailboxMessage from the
 * message detail page. Re-verifies staff + tenant on every call.
 */
export async function replyToInboundMailboxMessageAction(input: {
  clientId: string;
  inboundMessageId: string;
  bodyText: string;
}): Promise<ReplyToInboundMessageResult> {
  const staff = await requireOpensDoorsStaff();
  const result = await replyToInboundMailboxMessage({
    staff,
    clientId: input.clientId,
    inboundMessageId: input.inboundMessageId,
    bodyText: input.bodyText,
  });
  if (result.ok) {
    revalidatePath(
      `/clients/${input.clientId}/activity/messages/${input.inboundMessageId}`,
    );
    revalidatePath(`/clients/${input.clientId}/activity`);
  }
  return result;
}

/**
 * PR P — operator requests an on-demand fetch of the full inbound
 * body from the provider. Only the full-body cache on the
 * `InboundMailboxMessage` row is mutated; no email is sent.
 */
export async function fetchInboundMessageFullBodyAction(input: {
  clientId: string;
  inboundMessageId: string;
}): Promise<FetchInboundFullBodyResult> {
  const staff = await requireOpensDoorsStaff();
  const result = await fetchInboundMessageFullBody({
    staff,
    clientId: input.clientId,
    inboundMessageId: input.inboundMessageId,
  });
  if (result.ok) {
    revalidatePath(
      `/clients/${input.clientId}/activity/messages/${input.inboundMessageId}`,
    );
  }
  return result;
}

/**
 * PR J — mark an InboundMailboxMessage as handled without sending a
 * reply (e.g. handled in another system).
 */
export async function markInboundMailboxMessageHandledAction(input: {
  clientId: string;
  inboundMessageId: string;
}): Promise<
  | { ok: true; handledAt: string; handledByStaffUserId: string }
  | { ok: false; error: string; errorCode: string }
> {
  const staff = await requireOpensDoorsStaff();
  const result = await markInboundMailboxMessageHandled({
    staff,
    clientId: input.clientId,
    inboundMessageId: input.inboundMessageId,
  });
  if (result.ok) {
    revalidatePath(
      `/clients/${input.clientId}/activity/messages/${input.inboundMessageId}`,
    );
    revalidatePath(`/clients/${input.clientId}/activity`);
  }
  return result;
}
