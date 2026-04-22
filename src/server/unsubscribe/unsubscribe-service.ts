import "server-only";

import { prisma } from "@/lib/db";
import {
  deriveEmailDomain,
  hashUnsubscribeToken,
  normaliseUnsubscribeEmail,
  UNSUBSCRIBE_TOKEN_SHAPE,
} from "@/lib/unsubscribe/unsubscribe-token";

/**
 * PR M — Server-side unsubscribe service.
 *
 * Two concerns:
 *   1. Issue an unsubscribe token at sequence dispatch time so the
 *      outbound email body + `List-Unsubscribe` header carry a real
 *      link we can resolve later.
 *   2. Redeem a token from the public `/unsubscribe/[token]` route
 *      (GET confirmation + POST one-click handler) and suppress the
 *      recipient for that client workspace.
 *
 * Safety intent:
 *   * Every public-facing outcome returns a tagged, operator-safe
 *     result — the UI must never reveal whether an arbitrary email
 *     exists in our database beyond generic copy.
 *   * Suppression is EMAIL-scope only (`SuppressedEmail`). Domain-
 *     scope suppression stays with the manual governed list sync; a
 *     single unsubscribe must never block a whole organisation.
 *   * Raw tokens are never stored; only the SHA-256 hash is persisted.
 *   * Repeated redemptions are idempotent — the second call returns
 *     `already_unsubscribed` without spamming the audit log.
 */

export type IssueUnsubscribeTokenInput = {
  clientId: string;
  contactId?: string | null;
  outboundEmailId?: string | null;
  email: string;
  /** Defaults to `"outreach_unsubscribe"`. */
  purpose?: string;
};

export type IssueUnsubscribeTokenResult = {
  tokenId: string;
  tokenHash: string;
  /** Caller plants this into the email body / List-Unsubscribe header. */
  rawToken: string;
};

/**
 * Create and persist an unsubscribe token row for a single recipient.
 * Returns the raw token so the caller can embed it into the outbound
 * email — it is never persisted in the clear.
 */
export async function issueUnsubscribeToken(
  input: IssueUnsubscribeTokenInput,
  options: {
    /** Injected so the caller can use a freshly generated random token. */
    rawToken: string;
  },
): Promise<IssueUnsubscribeTokenResult> {
  const { clientId, contactId, outboundEmailId } = input;
  const email = normaliseUnsubscribeEmail(input.email);
  if (!clientId) {
    throw new Error("issueUnsubscribeToken: clientId is required.");
  }
  if (!email) {
    throw new Error("issueUnsubscribeToken: email is required.");
  }
  if (!UNSUBSCRIBE_TOKEN_SHAPE.test(options.rawToken)) {
    throw new Error("issueUnsubscribeToken: rawToken has invalid shape.");
  }

  const tokenHash = hashUnsubscribeToken(options.rawToken);
  const created = await prisma.unsubscribeToken.create({
    data: {
      tokenHash,
      clientId,
      contactId: contactId ?? null,
      outboundEmailId: outboundEmailId ?? null,
      email,
      emailDomain: deriveEmailDomain(email),
      purpose: input.purpose ?? "outreach_unsubscribe",
    },
    select: { id: true, tokenHash: true },
  });
  return {
    tokenId: created.id,
    tokenHash: created.tokenHash,
    rawToken: options.rawToken,
  };
}

// ---------------------------------------------------------------------------
// Resolution + redemption.
// ---------------------------------------------------------------------------

export type ResolvedUnsubscribeToken = {
  id: string;
  clientId: string;
  clientName: string;
  contactId: string | null;
  outboundEmailId: string | null;
  email: string;
  emailDomain: string | null;
  usedAt: Date | null;
  createdAt: Date;
};

/**
 * Resolve a raw token to its database row + the sending client's
 * display name (used by the public confirmation page). Returns `null`
 * for any malformed / unknown token — callers MUST render the generic
 * invalid-link page in that case and never hint at whether the token
 * would have resolved in a different tenant.
 */
export async function resolveUnsubscribeToken(
  rawToken: string,
): Promise<ResolvedUnsubscribeToken | null> {
  if (typeof rawToken !== "string" || !UNSUBSCRIBE_TOKEN_SHAPE.test(rawToken)) {
    return null;
  }
  const tokenHash = hashUnsubscribeToken(rawToken);
  const row = await prisma.unsubscribeToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      clientId: true,
      contactId: true,
      outboundEmailId: true,
      email: true,
      emailDomain: true,
      usedAt: true,
      createdAt: true,
      client: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    contactId: row.contactId,
    outboundEmailId: row.outboundEmailId,
    email: row.email,
    emailDomain: row.emailDomain,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

export type PerformUnsubscribeResult =
  | {
      status: "invalid";
    }
  | {
      status: "unsubscribed";
      clientId: string;
      clientName: string;
      email: string;
    }
  | {
      status: "already_unsubscribed";
      clientId: string;
      clientName: string;
      email: string;
    };

/**
 * Redeem a raw unsubscribe token. Idempotent — repeated calls after
 * the first success return `already_unsubscribed`.
 *
 * Side effects when status is `unsubscribed`:
 *   * upsert `SuppressedEmail` for (clientId, email).
 *   * set `UnsubscribeToken.usedAt` to now.
 *   * if `contactId` is still valid, flip `Contact.isSuppressed = true`
 *     and stamp `lastSuppressionCheckAt` so future planners see the
 *     suppression immediately without waiting for a refresh run.
 *   * write an `AuditLog` row with action=UPDATE, entityType=`UnsubscribeToken`.
 */
export async function performUnsubscribe(
  rawToken: string,
): Promise<PerformUnsubscribeResult> {
  const resolved = await resolveUnsubscribeToken(rawToken);
  if (!resolved) return { status: "invalid" };

  if (resolved.usedAt) {
    return {
      status: "already_unsubscribed",
      clientId: resolved.clientId,
      clientName: resolved.clientName,
      email: resolved.email,
    };
  }

  const now = new Date();

  // Single transaction — if any step fails, the token stays unused so
  // the recipient can retry the link.
  await prisma.$transaction(async (tx) => {
    await tx.suppressedEmail.upsert({
      where: {
        clientId_email: {
          clientId: resolved.clientId,
          email: resolved.email,
        },
      },
      create: {
        clientId: resolved.clientId,
        email: resolved.email,
        // sourceId intentionally null — this suppression did not come
        // from a governed SuppressionSource sync.
        sourceId: null,
        syncedAt: now,
      },
      update: {
        // Refresh the timestamp so the operator can see the most
        // recent suppression touch on the row.
        syncedAt: now,
      },
    });

    await tx.unsubscribeToken.update({
      where: { id: resolved.id },
      data: { usedAt: now },
    });

    if (resolved.contactId) {
      await tx.contact.updateMany({
        where: {
          id: resolved.contactId,
          clientId: resolved.clientId,
        },
        data: {
          isSuppressed: true,
          lastSuppressionCheckAt: now,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        // This is a recipient-initiated action; no staff user is
        // involved. Leaving `staffUserId` null is consistent with other
        // system-initiated audit rows.
        staffUserId: null,
        clientId: resolved.clientId,
        action: "UPDATE",
        entityType: "UnsubscribeToken",
        entityId: resolved.id,
        metadata: {
          kind: "recipient_unsubscribed",
          email: resolved.email,
          emailDomain: resolved.emailDomain,
          contactId: resolved.contactId,
          outboundEmailId: resolved.outboundEmailId,
          purpose: "outreach_unsubscribe",
        },
      },
    });
  });

  return {
    status: "unsubscribed",
    clientId: resolved.clientId,
    clientName: resolved.clientName,
    email: resolved.email,
  };
}
