import "server-only";

import type { OutboundEmail } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { resolveValidatedSenderForClient } from "@/server/email/sender-identity";
import { getGoogleGmailAccessTokenForMailbox } from "@/server/mailbox/google-mailbox-access";
import { evaluateAutonomousActorGuard } from "@/lib/safety/autonomous-actor-guard";
import {
  autonomousRelayIsActive,
  resolveAutonomousRelayState,
} from "@/server/safety/autonomous-mode";
import {
  buildRfc5322PlainTextEmail,
  fetchDeliveredGmailMessageId,
  findGmailMessageIdByRfc822MessageId,
  generateRfc822MessageId,
  sendGmailUsersMessagesSend,
  stableRfc822MessageId,
} from "@/server/mailbox/gmail-sendmail";
import { reportError } from "@/lib/logger";
import { getMicrosoftGraphAccessTokenForMailbox } from "@/server/mailbox/microsoft-mailbox-access";
import {
  classifyMailboxCredentialFailure,
  mailboxCredentialFailureMessage,
} from "@/server/mailbox/mailbox-credential-failure";
import {
  findGraphSentMessageId,
  isMicrosoftMimeSendEnabled,
  sendMicrosoftGraphMimeSendMail,
  sendMicrosoftGraphSendMail,
} from "@/server/mailbox/microsoft-graph-sendmail";
import { isSendPreflightDedupEnabled } from "./send-preflight-dedup";
import {
  evaluateOutboundDispatchRecheck,
  isDispatchRecheckEnabled,
} from "./dispatch-recheck";
import { evaluateProspectSendTransport } from "./prospect-send-transport-guard";
import { classifyRecipientAddress } from "@/lib/safety/recipient-verification-policy";
import {
  isRecipientVerificationEnabled,
  lookupMailRouteForAddress,
} from "@/server/outreach/recipient-mail-route";
import { buildEmailBodyParts } from "@/lib/unsubscribe/email-body-parts";
import {
  hasBlockingFinding,
  mailboxSignatureFindings,
} from "@/lib/clients/signature-link-alignment";
import { buildMailboxGovernedEmailBodies } from "@/lib/unsubscribe/outreach-mailbox-bodies";
import { appendOpenTrackingPixel } from "@/lib/tracking/open-pixel";
import {
  buildOpenTrackingPixelUrlForSender,
  CLIENT_OPEN_TRACKING_SELECT,
} from "@/lib/tracking/client-open-tracking";
import { getOutboundEmailProvider } from "../providers";
import {
  humanizeGovernanceRejection,
  mailboxIneligibleForGovernedSendExecution,
  markReservationConsumedForOutbound,
  markReservationReleasedForOutbound,
} from "@/server/mailbox/sending-policy";
import { reconcilePrimaryMailboxForClient } from "@/server/mailbox/mailbox-primary-consistency";
import {
  computeNextRetryAt,
  isRetryableSendFailure,
  maxOutboundSendRetries,
} from "./retry-policy";

/**
 * PR N — pull the List-Unsubscribe header values that
 * `sendSequenceStepBatch` persisted into `OutboundEmail.metadata.headers`.
 *
 * The metadata shape is not enforced at the DB level (it is
 * `Json?`), so we defensively narrow each field and fall back to
 * `null` on any shape mismatch. Returns `null` when no compliance
 * headers are configured for this row.
 */
function readListUnsubscribeHeadersFromMetadata(
  metadata: unknown,
): { listUnsubscribe: string; listUnsubscribePost: string } | null {
  if (!metadata || typeof metadata !== "object") return null;
  const headers = (metadata as { headers?: unknown }).headers;
  if (!headers || typeof headers !== "object") return null;
  const lu = (headers as { listUnsubscribe?: unknown }).listUnsubscribe;
  const lup = (headers as { listUnsubscribePost?: unknown }).listUnsubscribePost;
  if (typeof lu !== "string" || typeof lup !== "string") return null;
  const luTrim = lu.trim();
  const lupTrim = lup.trim();
  if (!luTrim || !lupTrim) return null;
  if (/[\r\n]/.test(luTrim) || /[\r\n]/.test(lupTrim)) return null;
  return { listUnsubscribe: luTrim, listUnsubscribePost: lupTrim };
}

/**
 * Extract the hosted URL from an already-angle-bracketed
 * `List-Unsubscribe` value (`<https://...>`). Returns `null` if the
 * value is not wrapped or not an http(s) URL — Microsoft Graph's
 * extended-property workaround requires the URL form.
 */
function extractHostedListUnsubscribeUrl(listUnsubscribe: string): string | null {
  const m = listUnsubscribe.match(/^<(https?:\/\/[^>]+)>$/);
  return m ? m[1] : null;
}

function isMailboxReauthRequiredError(provider: "MICROSOFT" | "GOOGLE", error: string): boolean {
  return classifyMailboxCredentialFailure(provider, error).connectionStatus !== null;
}

/**
 * Takes a mailbox out of CONNECTED when a send proves its credentials are dead.
 *
 * The classification is shared with reply sync deliberately. Both paths call
 * the same `getXAccessTokenForMailbox` and therefore stand or fall on the same
 * refresh-token grant; if they disagreed about what a failure means, a mailbox
 * could be "dead" to one and "connected" to the other.
 *
 * The change here is that a DELETED account no longer lands in the same bucket
 * as an expired sign-in. Previously `AADSTS500341` matched on `invalid_grant`
 * (Entra wraps it in one) and the mailbox was left in CONNECTION_ERROR telling
 * staff to "reconnect and complete MFA" — an instruction that cannot be
 * followed, for an account that no longer exists.
 */
async function markMailboxReauthRequired(
  mailboxIdentityId: string,
  clientId: string,
  provider: "MICROSOFT" | "GOOGLE",
  error: string,
) {
  const failure = classifyMailboxCredentialFailure(provider, error);
  // Pulled into a local so it stays narrowed inside the transaction closure.
  const nextStatus = failure.connectionStatus;
  if (!nextStatus) return;
  await prisma.$transaction(async (tx) => {
    await tx.clientMailboxIdentity.updateMany({
      where: { id: mailboxIdentityId },
      data: {
        connectionStatus: nextStatus,
        lastError: mailboxCredentialFailureMessage(provider, failure, error).slice(0, 4000),
      },
    });
    await reconcilePrimaryMailboxForClient(tx, clientId);
  });
}

/**
 * Row 108 — best-effort only, by contract. Runs strictly AFTER a Gmail send
 * has already been recorded as SENT. Reads back the Message-ID Gmail actually
 * stamped (it rewrites whatever we supply — see
 * docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md) and corrects the
 * stored `rfc822MessageId` so a future reply's In-Reply-To can link via
 * BY_THREAD_REF instead of the heuristic legs.
 *
 * THE SAFETY CONTRACT IS ABSOLUTE: every exception here is caught and
 * swallowed. This function must never throw, never retry, and never touch
 * `status`. A delivered email is worth more than a matching id — on any
 * failure the row simply keeps the value already written at send time and
 * falls back to today's heuristic matching, exactly as before this row.
 */
async function captureDeliveredGmailMessageIdBestEffort(input: {
  outboundEmailId: string;
  accessToken: string;
  providerMessageId: string;
  storedRfc822MessageId: string;
}): Promise<void> {
  try {
    const gmailMessageId = input.providerMessageId.replace(/^gmail:/, "");
    if (!gmailMessageId) return;
    const delivered = await fetchDeliveredGmailMessageId({
      accessToken: input.accessToken,
      gmailMessageId,
    });
    if (!delivered || delivered === input.storedRfc822MessageId) return;
    // Guarded on providerMessageId so a row reconciled or changed since the
    // send-time write is left alone rather than clobbered.
    await prisma.outboundEmail.updateMany({
      where: { id: input.outboundEmailId, providerMessageId: input.providerMessageId },
      data: { rfc822MessageId: delivered },
    });
  } catch (e) {
    reportError(e, {
      scope: "outbound.gmail-messageid-readback",
      detail:
        "Post-send Gmail Message-ID read-back failed; the send already succeeded and stands unchanged — this outbound keeps its originally stored rfc822MessageId and falls back to heuristic reply matching.",
      outboundEmailId: input.outboundEmailId,
    });
  }
}

/**
 * Executes provider send for PROCESSING rows. Idempotent if `providerMessageId` already set.
 * Uses conditional updates so duplicate worker invocations cannot double-apply SENT.
 */
export async function executeOutboundSend(outboundEmailId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const row = await prisma.outboundEmail.findUnique({
    where: { id: outboundEmailId },
  });

  if (!row) {
    return { ok: false, error: "Outbound not found" };
  }

  if (row.providerMessageId) {
    return { ok: true };
  }

  if (row.status !== "PROCESSING") {
    return { ok: true };
  }

  // ── The autonomous-actor safety gate ──────────────────────────────────────
  // Greg's rule: while an agent is running unattended, real email may leave
  // this system for ONE client only. Enforced HERE, at the point of dispatch,
  // rather than upstream, because upstream is where an agent writes code.
  //
  // A row carrying a `staffUserId` was launched by a signed-in person and is
  // never touched — the business keeps working while an agent works beside it.
  // A row with no staff behind it is treated as ours, and must be allowlisted
  // AND carry a client whose Autonomous sending switch a named member of staff
  // has deliberately turned on (re-scoped 2026-08-28; see the guard's header).
  //
  // The whole block is skipped when the relay is not running, so it costs
  // nothing (not even the extra read) in ordinary operation.
  if (autonomousRelayIsActive()) {
    const client = await prisma.client.findUnique({
      where: { id: row.clientId },
      select: { slug: true, autonomousSendEnabled: true },
    });
    const guard = evaluateAutonomousActorGuard({
      action: "SEND",
      actor: row.staffUserId ? "HUMAN_STAFF" : "MACHINE",
      clientSlug: client?.slug ?? null,
      // `?? null` on purpose: a client row that could not be read at all and a
      // client nobody has decided about are the same answer here — refuse.
      clientAutonomousSend: client?.autonomousSendEnabled ?? null,
      relay: resolveAutonomousRelayState(),
    });
    if (!guard.allowed) {
      await markFailed(row.id, guard.code.toUpperCase(), guard.reason);
      return { ok: false, error: guard.reason };
    }
  }

  const to = normalizeEmail(row.toEmail);
  const decision = await evaluateSuppression(row.clientId, to);
  if (decision.suppressed) {
    await prisma.outboundEmail.updateMany({
      where: { id: row.id, status: "PROCESSING", providerMessageId: null },
      data: {
        status: "BLOCKED_SUPPRESSION",
        suppressionSnapshot: decision as object,
        claimedAt: null,
        claimExpiresAt: null,
        providerIdempotencyKey: null,
        lastProviderEventType: "suppression_recheck_blocked",
        lastErrorMessage: "Recipient became suppressed before send completed",
        lastErrorCode: "SUPPRESSED",
      },
    });
    if (row.mailboxIdentityId) {
      await markReservationReleasedForOutbound(row.id);
    }
    return { ok: true };
  }

  // M2/M3 — dispatch-time cooldown + hard-bounce re-check (default OFF; behind
  // SEND_DISPATCH_RECHECK_ENABLED). The planner applied these when the row was
  // staged, but a row that sat QUEUED (long retry backoff / "prepare now, send
  // later") can be stale. Suppression / DNC / unsubscribe were already re-checked
  // above; this adds the 10-day cooldown timer (M2) and a hard-bounce backstop
  // that does not depend on the suppression flag (M3). We reuse the existing
  // BLOCKED_SUPPRESSION terminal (no schema change) but tag a distinct error
  // code so the activity detail shows exactly why it didn't send.
  if (isDispatchRecheckEnabled()) {
    const recheck = await evaluateOutboundDispatchRecheck({
      outboundEmailId: row.id,
      toEmail: to,
      now: new Date(),
    });
    if (recheck.block) {
      await prisma.outboundEmail.updateMany({
        where: { id: row.id, status: "PROCESSING", providerMessageId: null },
        data: {
          status: "BLOCKED_SUPPRESSION",
          claimedAt: null,
          claimExpiresAt: null,
          providerIdempotencyKey: null,
          lastProviderEventType: "dispatch_recheck_blocked",
          lastErrorCode:
            recheck.kind === "recent_bounce" ? "RECENT_BOUNCE" : "OUTREACH_COOLDOWN",
          lastErrorMessage: recheck.reason.slice(0, 2000),
        },
      });
      if (row.mailboxIdentityId) {
        await markReservationReleasedForOutbound(row.id);
      }
      return { ok: true };
    }
  }

  if (!row.subject || !row.bodySnapshot) {
    await markFailed(row.id, "INVALID_PAYLOAD", "Missing subject or body snapshot");
    return { ok: false, error: "Invalid payload" };
  }

  // ── Recipient address verification ────────────────────────────────────────
  // Is this address well-formed, and does its domain have anywhere for mail to
  // land? Until this gate the only check of either kind was a format regex at
  // CSV/RocketReach import — which the Universe materialisation path
  // (universe-to-client-list.ts) does not go through at all, and which no
  // amount of regex could answer the second question anyway.
  //
  // Sending to a domain with no mail destination is a guaranteed hard bounce,
  // and hard bounces are what damage a sending reputation.
  //
  // Placed HERE rather than at import for the same reason suppression is
  // re-checked here: a list loaded last month is dispatched today, and a
  // company that folded in between still has rows sitting in the queue.
  //
  // Only a PROVEN-dead domain fails the row. A failure of the check itself
  // returns the row to the queue (see retry-policy: the code below is
  // retryable) so a resolver having a bad minute delays mail instead of
  // dropping it. Kill switch: RECIPIENT_VERIFICATION_ENABLED=false.
  if (isRecipientVerificationEnabled()) {
    const route = await lookupMailRouteForAddress(to);
    const verification = classifyRecipientAddress({ email: to, route });
    if (verification.verdict === "block") {
      await markFailed(row.id, verification.code, verification.reason);
      return { ok: false, error: verification.reason };
    }
    if (verification.verdict === "defer") {
      return await handleSendFailure(
        row.id,
        row.retryCount,
        verification.reason,
        verification.code,
        row.mailboxIdentityId,
      );
    }
  }

  // A prospect-bound row must leave through a connected mailbox. Without one it
  // would fall through to the legacy provider stack below, which is the mock
  // whenever EMAIL_PROVIDER is unset — and the mock reports success without
  // sending anything. Refuse instead of silently reporting a send that never
  // happened. See prospect-send-transport-guard.ts for the full reasoning.
  const transport = evaluateProspectSendTransport(row);
  if (transport.block) {
    await markFailed(row.id, transport.code, transport.reason);
    return { ok: false, error: transport.reason };
  }

  if (row.mailboxIdentityId) {
    return await sendViaConnectedMailboxOrFail(row, to);
  }

  // Legacy / non-mailbox row: Resend or mock (see getOutboundEmailProvider).
  const client = await prisma.client.findUnique({
    where: { id: row.clientId },
    select: {
      defaultSenderEmail: true,
      senderIdentityStatus: true,
    },
  });

  if (!client) {
    await markFailed(row.id, "CLIENT_MISSING", "Client not found");
    return { ok: false, error: "Client not found" };
  }

  let resolvedFrom: string;
  try {
    const r = resolveValidatedSenderForClient({
      clientDefaultSenderEmail: client.defaultSenderEmail,
      clientSenderIdentityStatus: client.senderIdentityStatus,
      rowFromAddress: row.fromAddress,
    });
    resolvedFrom = r.from;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(row.id, "SENDER_REJECTED", msg);
    return { ok: false, error: msg };
  }

  const idempotencyKey =
    row.providerIdempotencyKey?.trim() ??
    `osm_fallback_${row.id}_a${row.sendAttempt}`;

  const listUnsub = readListUnsubscribeHeadersFromMetadata(row.metadata);
  const providerExtraHeaders = listUnsub
    ? [
        { name: "List-Unsubscribe", value: listUnsub.listUnsubscribe },
        { name: "List-Unsubscribe-Post", value: listUnsub.listUnsubscribePost },
      ]
    : undefined;
  const providerBody = buildEmailBodyParts({
    bodyText: row.bodySnapshot,
    unsubscribeUrl: listUnsub ? extractHostedListUnsubscribeUrl(listUnsub.listUnsubscribe) : null,
  });

  try {
    const provider = getOutboundEmailProvider();
    const result = await provider.send({
      correlationId: row.correlationId,
      from: row.fromAddress?.trim() ? row.fromAddress : resolvedFrom,
      to,
      subject: row.subject,
      bodyText: providerBody.text,
      bodyHtml: providerBody.html,
      tag: row.clientId,
      idempotencyKey,
      extraHeaders: providerExtraHeaders,
    });

    if (result.ok === false) {
      return await handleSendFailure(
        row.id,
        row.retryCount,
        result.error,
        result.code,
        row.mailboxIdentityId,
      );
    }

    const updated = await prisma.outboundEmail.updateMany({
      where: {
        id: row.id,
        status: "PROCESSING",
        providerMessageId: null,
      },
      data: {
        status: "SENT",
        providerMessageId: result.providerMessageId,
        providerName: result.providerName,
        sentAt: new Date(),
        claimedAt: null,
        claimExpiresAt: null,
        nextRetryAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        failureReason: null,
        metadata: result.raw as object | undefined,
        fromAddress: row.fromAddress?.trim() ? row.fromAddress : resolvedFrom,
        toDomain: extractDomainFromEmail(to) || row.toDomain,
      },
    });

    if (updated.count === 0) {
      return { ok: true };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return await handleSendFailure(
      row.id,
      row.retryCount,
      msg,
      "EXCEPTION",
      row.mailboxIdentityId,
    );
  }
}

async function markFailed(id: string, code: string, message: string) {
  const row = await prisma.outboundEmail.findUnique({
    where: { id },
    select: { mailboxIdentityId: true },
  });
  await prisma.outboundEmail.updateMany({
    where: { id, status: "PROCESSING", providerMessageId: null },
    data: {
      status: "FAILED",
      claimedAt: null,
      claimExpiresAt: null,
      lastErrorCode: code,
      lastErrorMessage: message.slice(0, 2000),
      failureReason: message.slice(0, 2000),
    },
  });
  if (row?.mailboxIdentityId) {
    await markReservationReleasedForOutbound(id);
  }
}

async function handleSendFailure(
  id: string,
  retryCount: number,
  error: string,
  code: string | undefined,
  mailboxIdentityId: string | null,
): Promise<{ ok: false; error: string }> {
  const max = maxOutboundSendRetries();
  const retryable = isRetryableSendFailure(code, error);
  const next = retryCount + 1;

  if (retryable && next <= max) {
    const nextAt = computeNextRetryAt(retryCount);
    await prisma.outboundEmail.updateMany({
      where: { id, status: "PROCESSING", providerMessageId: null },
      data: {
        status: "QUEUED",
        retryCount: next,
        nextRetryAt: nextAt,
        claimedAt: null,
        claimExpiresAt: null,
        providerIdempotencyKey: null,
        lastErrorCode: code ?? "RETRYABLE",
        lastErrorMessage: error.slice(0, 2000),
        failureReason: error.slice(0, 2000),
        lastAttemptAt: new Date(),
      },
    });
    return { ok: false, error };
  }

  await prisma.outboundEmail.updateMany({
    where: { id, status: "PROCESSING", providerMessageId: null },
    data: {
      status: "FAILED",
      claimedAt: null,
      claimExpiresAt: null,
      providerIdempotencyKey: null,
      lastErrorCode: code ?? "FAILED",
      lastErrorMessage: error.slice(0, 2000),
      failureReason: error.slice(0, 2000),
    },
  });
  if (mailboxIdentityId) {
    await markReservationReleasedForOutbound(id);
  }
  return { ok: false, error };
}

async function sendViaConnectedMailboxOrFail(
  row: OutboundEmail,
  to: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!row.mailboxIdentityId) {
    return { ok: false, error: "Missing governed mailbox" };
  }
  const mailbox = await prisma.clientMailboxIdentity.findFirst({
    where: { id: row.mailboxIdentityId, clientId: row.clientId },
  });
  if (!mailbox) {
    await markFailed(row.id, "MAILBOX_MISSING", "Linked mailbox not found for this client");
    return { ok: false, error: "Linked mailbox not found" };
  }
  if (mailbox.workspaceRemovedAt) {
    await markFailed(
      row.id,
      "MAILBOX_REMOVED",
      "Mailbox was removed from the workspace before send completed",
    );
    return { ok: false, error: "Mailbox removed from workspace" };
  }

  const ineligible = mailboxIneligibleForGovernedSendExecution(mailbox);
  if (ineligible) {
    const msg = humanizeGovernanceRejection(ineligible, mailbox);
    await markFailed(row.id, ineligible, msg);
    return { ok: false, error: msg };
  }

  // Open tracking is OFF unless THIS client has been opted in, and the opt-in
  // requires a verified sender-aligned link domain (`go.<domain>`), so a pixel
  // — when there is one at all — is always served from the same domain family
  // as the sender. A cross-domain pixel is a phishing signal. The unsubscribe
  // link was already aligned per-client at plan time in send-introduction.ts.
  //
  // A client row that cannot be read leaves `trackingClient` null, and a null
  // client means no pixel: the failure mode is "untracked", never "tracked
  // from the wrong domain".
  const trackingClient = await prisma.client.findUnique({
    where: { id: row.clientId },
    select: CLIENT_OPEN_TRACKING_SELECT,
  });

  if (mailbox.provider === "GOOGLE") {
    const fromForLog = row.fromAddress?.trim() || normalizeEmail(mailbox.email);
    if (!fromForLog.includes("@")) {
      await markFailed(row.id, "INVALID_FROM", "Mailbox from address is invalid for send");
      return { ok: false, error: "Invalid mailbox from address" };
    }
    const subject = row.subject;
    const body = row.bodySnapshot;
    if (!subject?.trim() || !body) {
      await markFailed(row.id, "INVALID_PAYLOAD", "Missing subject or body snapshot");
      return { ok: false, error: "Invalid payload" };
    }
    const listUnsub = readListUnsubscribeHeadersFromMetadata(row.metadata);
    const hostedU = listUnsub ? extractHostedListUnsubscribeUrl(listUnsub.listUnsubscribe) : null;
    // FAIL CLOSED on signature link alignment.
    //
    // The send gate has never looked at signature content: evaluateSendGovernance
    // contains no reference to signatures, and its link-domain check reads two
    // database columns, never the message. scripts/ops-cross-domain-audit.ts
    // detects exactly this and had no production caller — detector written, caller
    // never built, the same defect class as PR #194. This is the caller.
    //
    // Only the OpensDoors platform's own domain blocks. A remote image on a
    // third-party host does NOT: measured on production 2026-08-24, blocking on
    // that would have stopped the largest client for hosting its own logo on its
    // own website's CDN.
    if (hasBlockingFinding(mailboxSignatureFindings(mailbox))) {
      await markFailed(
        row.id,
        "SIGNATURE_LINK_MISALIGNED",
        "Mailbox signature links to the OpensDoors system's own address rather than the client's. Remove it from the signature before sending.",
      );
      return { ok: false, error: "Signature contains a misaligned link" };
    }
    const bodyParts = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: body,
      mailbox,
      hostedUnsubscribeUrl: hostedU,
      // Mailto rail: used only when no hosted (aligned-domain) URL exists, so
      // the recipient always has a visible opt-out even though the email
      // carries no host other than the sender's own.
      mailtoUnsubscribeAddress: mailbox.email,
    });
    // Stamp our own Message-ID so genuine replies link back to this exact send
    // via their In-Reply-To header (see process-synced-replies BY_THREAD_REF).
    // H1/H2: when preflight-dedup is on, use a STABLE id so a retry can look the
    // message up by it and reconcile instead of re-sending.
    const dedupOn = isSendPreflightDedupEnabled();
    const rfc822MessageId = dedupOn
      ? stableRfc822MessageId(row.id, fromForLog)
      : generateRfc822MessageId(fromForLog);
    const gmailExtraHeaders = [
      { name: "Message-ID", value: rfc822MessageId },
      ...(listUnsub
        ? [
            { name: "List-Unsubscribe", value: listUnsub.listUnsubscribe },
            { name: "List-Unsubscribe-Post", value: listUnsub.listUnsubscribePost },
          ]
        : []),
    ];
    try {
      const accessToken = await getGoogleGmailAccessTokenForMailbox(mailbox.id);
      // H1/H2 preflight: on a retry, if this exact Message-ID already landed
      // (a prior attempt was accepted but its SENT write was lost), reconcile
      // to SENT instead of re-sending the email.
      if (dedupOn && row.sendAttempt > 1) {
        const lookup = await findGmailMessageIdByRfc822MessageId({
          accessToken,
          rfc822MessageId,
        });
        if (lookup.status === "found") {
          const reconciled = await prisma.outboundEmail.updateMany({
            where: { id: row.id, status: "PROCESSING", providerMessageId: null },
            data: {
              status: "SENT",
              providerMessageId: lookup.providerMessageId,
              providerName: "google_gmail",
              rfc822MessageId,
              sentAt: new Date(),
              claimedAt: null,
              claimExpiresAt: null,
              nextRetryAt: null,
              lastErrorCode: "RECONCILED_PREFLIGHT",
              lastErrorMessage:
                "Preflight found this message already sent; reconciled instead of re-sending",
              failureReason: null,
              fromAddress: fromForLog,
              toDomain: extractDomainFromEmail(to) || row.toDomain,
            },
          });
          if (reconciled.count > 0) {
            await markReservationConsumedForOutbound(row.id);
          }
          return { ok: true };
        }
      }
      // Open tracking: embed a hidden pixel keyed on correlationId so the
      // /api/track/open endpoint can record opens. Null — no pixel — unless
      // this client is opted in and their link domain is verified.
      const gmailPixelUrl = trackingClient
        ? buildOpenTrackingPixelUrlForSender(row.correlationId, trackingClient, fromForLog)
        : null;
      const gmailHtml = gmailPixelUrl
        ? appendOpenTrackingPixel(bodyParts.html, gmailPixelUrl)
        : bodyParts.html;
      const rfc = buildRfc5322PlainTextEmail({
        from: fromForLog,
        to,
        subject,
        bodyText: bodyParts.text,
        bodyHtml: gmailHtml,
        extraHeaders: gmailExtraHeaders,
      });
      const result = await sendGmailUsersMessagesSend({
        accessToken,
        rfc5322Message: rfc,
      });
      if (result.ok === false) {
        if (row.mailboxIdentityId && isMailboxReauthRequiredError("GOOGLE", result.error)) {
          await markMailboxReauthRequired(
            row.mailboxIdentityId,
            row.clientId,
            "GOOGLE",
            result.error,
          );
        }
        return await handleSendFailure(
          row.id,
          row.retryCount,
          result.error,
          result.code,
          row.mailboxIdentityId,
        );
      }
      const updated = await prisma.outboundEmail.updateMany({
        where: { id: row.id, status: "PROCESSING", providerMessageId: null },
        data: {
          status: "SENT",
          providerMessageId: result.providerMessageId,
          providerName: result.providerName,
          rfc822MessageId,
          sentAt: new Date(),
          claimedAt: null,
          claimExpiresAt: null,
          nextRetryAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          failureReason: null,
          fromAddress: fromForLog,
          toDomain: extractDomainFromEmail(to) || row.toDomain,
        },
      });
      if (updated.count === 0) {
        return { ok: true };
      }
      await markReservationConsumedForOutbound(row.id);
      // Row 108 — best-effort, never allowed to affect the outcome above.
      // captureDeliveredGmailMessageIdBestEffort swallows every failure itself;
      // this send is already recorded as SENT regardless of what happens next.
      await captureDeliveredGmailMessageIdBestEffort({
        outboundEmailId: row.id,
        accessToken,
        providerMessageId: result.providerMessageId,
        storedRfc822MessageId: rfc822MessageId,
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (row.mailboxIdentityId && isMailboxReauthRequiredError("GOOGLE", msg)) {
        await markMailboxReauthRequired(row.mailboxIdentityId, row.clientId, "GOOGLE", msg);
      }
      return await handleSendFailure(
        row.id,
        row.retryCount,
        msg,
        "EXCEPTION",
        row.mailboxIdentityId,
      );
    }
  }
  if (mailbox.provider !== "MICROSOFT") {
    await markFailed(row.id, "PROVIDER", "Unknown mailbox provider for governed send");
    return { ok: false, error: "Unknown provider" };
  }

  const fromForLog = row.fromAddress?.trim() || normalizeEmail(mailbox.email);
  if (!fromForLog.includes("@")) {
    await markFailed(row.id, "INVALID_FROM", "Mailbox from address is invalid for send");
    return { ok: false, error: "Invalid mailbox from address" };
  }

  const subject = row.subject;
  const body = row.bodySnapshot;
  if (!subject?.trim() || !body) {
    await markFailed(row.id, "INVALID_PAYLOAD", "Missing subject or body snapshot");
    return { ok: false, error: "Invalid payload" };
  }

  const listUnsub = readListUnsubscribeHeadersFromMetadata(row.metadata);
  const graphListUnsubscribeUrl = listUnsub
    ? extractHostedListUnsubscribeUrl(listUnsub.listUnsubscribe)
    : null;
  // FAIL CLOSED on signature link alignment.
  //
  // The send gate has never looked at signature content: evaluateSendGovernance
  // contains no reference to signatures, and its link-domain check reads two
  // database columns, never the message. scripts/ops-cross-domain-audit.ts
  // detects exactly this and had no production caller — detector written, caller
  // never built, the same defect class as PR #194. This is the caller.
  //
  // Only the OpensDoors platform's own domain blocks. A remote image on a
  // third-party host does NOT: measured on production 2026-08-24, blocking on
  // that would have stopped the largest client for hosting its own logo on its
  // own website's CDN.
  if (hasBlockingFinding(mailboxSignatureFindings(mailbox))) {
    await markFailed(
      row.id,
      "SIGNATURE_LINK_MISALIGNED",
      "Mailbox signature links to the OpensDoors system's own address rather than the client's. Remove it from the signature before sending.",
    );
    return { ok: false, error: "Signature contains a misaligned link" };
  }
  const bodyParts = buildMailboxGovernedEmailBodies({
    bodySnapshotPlain: body,
    mailbox,
    hostedUnsubscribeUrl: graphListUnsubscribeUrl,
    // See the note on the Google path above.
    mailtoUnsubscribeAddress: mailbox.email,
  });
  // Open tracking pixel (see Gmail path above) — same per-client opt-in.
  const graphPixelUrl = trackingClient
    ? buildOpenTrackingPixelUrlForSender(row.correlationId, trackingClient, fromForLog)
    : null;
  const graphHtml = graphPixelUrl
    ? appendOpenTrackingPixel(bodyParts.html, graphPixelUrl)
    : bodyParts.html;

  try {
    const accessToken = await getMicrosoftGraphAccessTokenForMailbox(mailbox.id);
    // H1/H2 best-effort preflight (Graph can't stamp or look up our Message-ID):
    // on a retry, check Sent Items for the same recipient + subject in the prior
    // claim window and reconcile instead of re-sending. Fuzzy by nature — see
    // findGraphSentMessageId; gated behind the preflight-dedup flag.
    if (isSendPreflightDedupEnabled() && row.sendAttempt > 1) {
      const lookbackMs = 6 * 60 * 60 * 1000; // 6h — covers an operator requeue gap
      const sinceIso = new Date(
        (row.claimedAt ? row.claimedAt.getTime() : Date.now()) - lookbackMs,
      ).toISOString();
      const lookup = await findGraphSentMessageId({
        accessToken,
        mailboxUserPrincipalName: mailbox.emailNormalized,
        to,
        subject,
        sinceIso,
      });
      if (lookup.status === "found") {
        const reconciled = await prisma.outboundEmail.updateMany({
          where: { id: row.id, status: "PROCESSING", providerMessageId: null },
          data: {
            status: "SENT",
            providerMessageId: lookup.providerMessageId,
            providerName: "microsoft_graph",
            sentAt: new Date(),
            claimedAt: null,
            claimExpiresAt: null,
            nextRetryAt: null,
            lastErrorCode: "RECONCILED_PREFLIGHT",
            lastErrorMessage:
              "Preflight found a matching Sent Items message; reconciled instead of re-sending",
            failureReason: null,
            fromAddress: fromForLog,
            toDomain: extractDomainFromEmail(to) || row.toDomain,
          },
        });
        if (reconciled.count > 0) {
          await markReservationConsumedForOutbound(row.id);
        }
        return { ok: true };
      }
    }
    // Default path: Graph JSON sendMail (HTML-only body; List-Unsubscribe via a
    // MAPI extended property). When MICROSOFT_MIME_SEND=on, submit raw MIME
    // instead so the message carries a text/plain alternative alongside the HTML
    // (HTML-only scores as spam) AND real List-Unsubscribe + List-Unsubscribe-Post
    // headers (true one-click unsubscribe) — neither of which Graph JSON allows.
    // Built with the same MIME helper the Gmail path already uses in production.
    const result = isMicrosoftMimeSendEnabled()
      ? await sendMicrosoftGraphMimeSendMail({
          accessToken,
          mailboxUserPrincipalName: mailbox.emailNormalized,
          correlationId: row.correlationId,
          rfc5322Message: buildRfc5322PlainTextEmail({
            from: fromForLog,
            to,
            subject,
            bodyText: bodyParts.text,
            bodyHtml: graphHtml,
            extraHeaders: listUnsub
              ? [
                  { name: "List-Unsubscribe", value: listUnsub.listUnsubscribe },
                  {
                    name: "List-Unsubscribe-Post",
                    value: listUnsub.listUnsubscribePost,
                  },
                ]
              : undefined,
          }),
        })
      : await sendMicrosoftGraphSendMail({
          accessToken,
          mailboxUserPrincipalName: mailbox.emailNormalized,
          to,
          subject,
          bodyText: bodyParts.text,
          correlationId: row.correlationId,
          options: {
            bodyHtml: graphHtml,
            ...(graphListUnsubscribeUrl
              ? { listUnsubscribeUrl: graphListUnsubscribeUrl }
              : {}),
          },
        });
    if (result.ok === false) {
      if (row.mailboxIdentityId && isMailboxReauthRequiredError("MICROSOFT", result.error)) {
        await markMailboxReauthRequired(
          row.mailboxIdentityId,
          row.clientId,
          "MICROSOFT",
          result.error,
        );
      }
      return await handleSendFailure(
        row.id,
        row.retryCount,
        result.error,
        result.code,
        row.mailboxIdentityId,
      );
    }
    // No `rfc822MessageId` here — deliberate, not an oversight. Both Graph send
    // paths (`sendMicrosoftGraphSendMail`'s JSON `sendMail` and
    // `sendMicrosoftGraphMimeSendMail`'s raw-MIME `sendMail`) call the `sendMail`
    // *action*, which returns 202 Accepted with an empty body — no message id,
    // real or otherwise. Graph never gets a stamped Message-ID today (measured
    // against production 2026-08-30, row 105,
    // docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md: 0 of 267 Graph sends
    // stamped). Capturing the real one would mean switching to the create-draft
    // (POST /messages, which returns `internetMessageId`) + send-by-id pattern —
    // a materially bigger change to this send path than adding a field here.
    const updated = await prisma.outboundEmail.updateMany({
      where: { id: row.id, status: "PROCESSING", providerMessageId: null },
      data: {
        status: "SENT",
        providerMessageId: result.providerMessageId,
        providerName: result.providerName,
        sentAt: new Date(),
        claimedAt: null,
        claimExpiresAt: null,
        nextRetryAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        failureReason: null,
        fromAddress: fromForLog,
        toDomain: extractDomainFromEmail(to) || row.toDomain,
      },
    });
    if (updated.count === 0) {
      return { ok: true };
    }
    await markReservationConsumedForOutbound(row.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (row.mailboxIdentityId && isMailboxReauthRequiredError("MICROSOFT", msg)) {
      await markMailboxReauthRequired(row.mailboxIdentityId, row.clientId, "MICROSOFT", msg);
    }
    return await handleSendFailure(
      row.id,
      row.retryCount,
      msg,
      "EXCEPTION",
      row.mailboxIdentityId,
    );
  }
}
