import "server-only";

import {
  classifyInboundFullBodyError,
  type InboundFullBodyErrorCategory,
} from "@/lib/inbox/inbound-full-body-errors";
import { prisma } from "@/lib/db";
import type { StaffUser } from "@/generated/prisma/client";
import { fetchGmailInboundMessageFullBody } from "@/server/mailbox/gmail-message-body";
import { getGoogleGmailAccessTokenForMailbox } from "@/server/mailbox/google-mailbox-access";
import { fetchMicrosoftInboundMessageFullBody } from "@/server/mailbox/microsoft-graph-message-body";
import { getMicrosoftGraphAccessTokenForMailbox } from "@/server/mailbox/microsoft-mailbox-access";
import { requireClientAccess } from "@/server/tenant/access";

export type FetchInboundFullBodyResult =
  | {
      ok: true;
      messageId: string;
      bodyText: string;
      bodyContentType: string;
      fullBodySize: number;
      fullBodySource: string;
      fullBodyFetchedAt: string;
    }
  | {
      ok: false;
      error: string;
      errorCode: string;
      /**
       * PR Q — operator-facing classification of the failure so the UI
       * can render a short, non-raw banner instead of the provider's
       * stack-shaped message.
       */
      category?: InboundFullBodyErrorCategory;
      title?: string;
      retryable?: boolean;
    };

/**
 * PR P — Fetch and cache the full body of an InboundMailboxMessage
 * from the provider (Microsoft Graph or Gmail) using the access token
 * of the mailbox that owns the message.
 *
 * This server action is allowed to mutate ONLY the full-body cache
 * columns on the `InboundMailboxMessage` row. It never sends, replies,
 * imports, or edits app settings. Tenant isolation is enforced by
 * `requireClientAccess` and a `clientId`-scoped load.
 */
export async function fetchInboundMessageFullBody(input: {
  staff: StaffUser;
  clientId: string;
  inboundMessageId: string;
}): Promise<FetchInboundFullBodyResult> {
  const { staff, clientId, inboundMessageId } = input;
  await requireClientAccess(staff, clientId);

  const message = await prisma.inboundMailboxMessage.findFirst({
    where: { id: inboundMessageId, clientId },
    select: {
      id: true,
      mailboxIdentityId: true,
      providerMessageId: true,
    },
  });
  if (!message) {
    return {
      ok: false,
      errorCode: "INBOUND_NOT_FOUND",
      error: "That inbound message is not part of this workspace.",
    };
  }
  if (!message.providerMessageId) {
    return {
      ok: false,
      errorCode: "NO_PROVIDER_MESSAGE_ID",
      error: "This inbound message has no provider message id to fetch.",
    };
  }

  const mailbox = await prisma.clientMailboxIdentity.findFirst({
    where: { id: message.mailboxIdentityId, clientId },
    select: {
      id: true,
      provider: true,
      connectionStatus: true,
      email: true,
      emailNormalized: true,
    },
  });
  if (!mailbox) {
    return {
      ok: false,
      errorCode: "MAILBOX_NOT_FOUND",
      error: "The mailbox for this message is no longer linked to this workspace.",
    };
  }
  if (mailbox.connectionStatus !== "CONNECTED") {
    return {
      ok: false,
      errorCode: "MAILBOX_NOT_CONNECTED",
      error: `Mailbox ${mailbox.email} is not connected. Reconnect it before fetching full bodies.`,
    };
  }

  if (mailbox.provider === "MICROSOFT") {
    let accessToken: string;
    try {
      accessToken = await getMicrosoftGraphAccessTokenForMailbox(mailbox.id);
    } catch (e) {
      return {
        ok: false,
        errorCode: "MS_TOKEN_ERROR",
        error: e instanceof Error ? e.message : "Microsoft token error",
      };
    }
    const res = await fetchMicrosoftInboundMessageFullBody({
      accessToken,
      mailboxUserPrincipalName: mailbox.emailNormalized,
      providerMessageId: message.providerMessageId,
    });
    if (!res.ok) {
      return classifyAndReturn({
        provider: "MICROSOFT",
        errorCode: res.errorCode,
        rawMessage: res.error,
      });
    }
    return persistFullBody({
      messageId: message.id,
      bodyText: res.normalized.text,
      bodyContentType: res.normalized.contentType,
      fullBodySize: res.normalized.size,
      fullBodySource: "MICROSOFT_GRAPH",
    });
  }

  if (mailbox.provider === "GOOGLE") {
    let accessToken: string;
    try {
      accessToken = await getGoogleGmailAccessTokenForMailbox(mailbox.id);
    } catch (e) {
      return {
        ok: false,
        errorCode: "GOOGLE_TOKEN_ERROR",
        error: e instanceof Error ? e.message : "Google token error",
      };
    }
    const res = await fetchGmailInboundMessageFullBody({
      accessToken,
      providerMessageId: message.providerMessageId,
    });
    if (!res.ok) {
      return classifyAndReturn({
        provider: "GOOGLE",
        errorCode: res.errorCode,
        rawMessage: res.error,
      });
    }
    return persistFullBody({
      messageId: message.id,
      bodyText: res.normalized.text,
      bodyContentType: res.normalized.contentType,
      fullBodySize: res.normalized.size,
      fullBodySource: "GMAIL_API",
    });
  }

  return {
    ok: false,
    errorCode: "PROVIDER_UNSUPPORTED",
    error: `Full-body fetch is not supported for provider ${mailbox.provider}.`,
  };
}

/**
 * PR Q — build a classified {ok: false} result from a provider error.
 * The operator-facing `error` becomes the classifier's short message;
 * the original provider text is kept in `errorCode` only (no stack,
 * no raw JSON, no body content).
 */
function classifyAndReturn(input: {
  provider: "MICROSOFT" | "GOOGLE";
  errorCode: string;
  rawMessage: string;
}): FetchInboundFullBodyResult {
  const classified = classifyInboundFullBodyError({
    provider: input.provider,
    errorCode: input.errorCode,
    rawMessage: input.rawMessage,
  });
  return {
    ok: false,
    errorCode: input.errorCode,
    error: classified.message,
    category: classified.category,
    title: classified.title,
    retryable: classified.retryable,
  };
}

async function persistFullBody(input: {
  messageId: string;
  bodyText: string;
  bodyContentType: string;
  fullBodySize: number;
  fullBodySource: string;
}): Promise<FetchInboundFullBodyResult> {
  if (!input.bodyText || input.bodyText.trim().length === 0) {
    return {
      ok: false,
      errorCode: "EMPTY_BODY",
      error: "The provider returned no readable body for this message.",
    };
  }
  const fetchedAt = new Date();
  await prisma.inboundMailboxMessage.update({
    where: { id: input.messageId },
    data: {
      bodyText: input.bodyText,
      bodyContentType: input.bodyContentType,
      fullBodySize: input.fullBodySize,
      fullBodySource: input.fullBodySource,
      fullBodyFetchedAt: fetchedAt,
    },
  });
  return {
    ok: true,
    messageId: input.messageId,
    bodyText: input.bodyText,
    bodyContentType: input.bodyContentType,
    fullBodySize: input.fullBodySize,
    fullBodySource: input.fullBodySource,
    fullBodyFetchedAt: fetchedAt.toISOString(),
  };
}
