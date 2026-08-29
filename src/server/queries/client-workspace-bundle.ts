import "server-only";

import { CONTROLLED_PILOT_HARD_MAX_RECIPIENTS } from "@/lib/controlled-pilot-constants";
import {
  appDomainsFromEnv,
  ownDomainsFor,
  signatureLinkStatusFor,
} from "@/lib/clients/signature-link-alignment";
import { prisma } from "@/lib/db";
import { computeOnboardingBriefCompletion, parseOpensDoorsBrief } from "@/lib/opensdoors-brief";
import {
  REQUIRED_OUTREACH_MAILBOX_COUNT,
  sumAggregateRemainingAcrossEligible,
  THEORETICAL_MAX_CLIENT_DAILY_SENDS,
  OUTREACH_MAILBOX_DAILY_CAP,
} from "@/lib/outreach-mailbox-model";
import { describeSenderReadiness } from "@/lib/sender-readiness";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { getGoogleServiceAccountDisplayInfo } from "@/server/integrations/google-sheets/service-account-display";
import { getClientMailboxMutationAllowed } from "@/server/mailbox-identities/mutator-access";
import {
  isGoogleMailboxOAuthConfigured,
  isMicrosoftMailboxOAuthConfigured,
} from "@/server/mailbox/oauth-env";
import {
  isMailboxExecutionEligible,
  resolveGovernedSendingMailboxFromRows,
} from "@/server/mailbox/sending-policy";
import { internalDomainsFromMailboxEmails } from "@/server/inbox/internal-domains";
import { chooseSignatureForSend } from "@/lib/mailboxes/sender-signature";
import { getClientByIdForStaff } from "@/server/queries/clients";
import { getRecentInboundMailboxMessagesForClient } from "@/server/queries/mailbox-inbox";
import { getMailboxSendingReadinessForClient } from "@/server/queries/mailbox-sending-readiness";
import { getRecentGovernedSendsForClient } from "@/server/queries/governed-send-ledger";
import { getLatestProvenSendAt } from "@/server/queries/proven-send";
import { getPilotContactSummaryForClient } from "@/server/queries/pilot-contact-summary";
import type { StaffUser } from "@/generated/prisma/client";
import type { MailboxAuthFailureSignal } from "@/lib/mailboxes/mailbox-auth-failure-overlay";
import {
  mailboxReauthMessage,
  shouldApplyMailboxAuthFailureOverlay,
} from "@/lib/mailboxes/mailbox-auth-failure-overlay";

export type ClientWorkspaceBundle = Awaited<ReturnType<typeof loadClientWorkspaceBundle>>;

const MAILBOX_REAUTH_FAILURE_RE =
  /invalid_grant|AADSTS50076|AAD5TS0276|multi-factor authentication|refresh token missing|requires this mailbox to re-authenticate/i;

async function getRecentMailboxAuthFailuresForClient(clientId: string) {
  const rows = await prisma.outboundEmail.findMany({
    where: {
      clientId,
      status: "FAILED",
      providerMessageId: null,
      mailboxIdentityId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      mailboxIdentityId: true,
      lastErrorMessage: true,
      failureReason: true,
      updatedAt: true,
    },
  });
  const failures = new Map<string, MailboxAuthFailureSignal>();
  for (const row of rows) {
    const mailboxId = row.mailboxIdentityId;
    const message = row.lastErrorMessage ?? row.failureReason ?? "";
    if (!mailboxId || !MAILBOX_REAUTH_FAILURE_RE.test(message)) continue;
    if (!failures.has(mailboxId)) {
      failures.set(mailboxId, {
        message,
        failedAt: row.updatedAt,
      });
    }
  }
  return failures;
}

/**
 * Shared server data for client workspace routes (overview + module pages).
 * One place to keep queries aligned with the production A–Z workflow.
 */
export async function loadClientWorkspaceBundle(
  clientId: string,
  accessibleClientIds: string[],
  staff: StaffUser,
) {
  const client = await getClientByIdForStaff(clientId, accessibleClientIds);
  if (!client) return { client: null as typeof client };

  // `client.mailboxIdentities` is already the client's COMPLETE, unfiltered
  // mailbox set (see `getClientByIdForStaff`). Two helpers below used to re-read
  // exactly those rows — measured as 2 of the 5 ClientMailboxIdentity round-trips
  // a workspace page cost (docs/ops/LOAD-SPEED-MEASUREMENT.md). Both now take the
  // rows we hold. The DB-reading variants stay for callers that hold nothing.
  const governedMailbox = resolveGovernedSendingMailboxFromRows(client.mailboxIdentities);
  const internalDomains = internalDomainsFromMailboxEmails(
    client.mailboxIdentities.map((m) => m.email),
  );

  const [
    graphInbox,
    sendingReadiness,
    recentGovernedSends,
    pilotContactSummary,
    canMutateMailboxes,
    recentMailboxAuthFailures,
    latestProvenSendAt,
  ] = await Promise.all([
    getRecentInboundMailboxMessagesForClient(clientId, 50, { internalDomains }),
    getMailboxSendingReadinessForClient(clientId, client.mailboxIdentities),
    getRecentGovernedSendsForClient(clientId, 25),
    getPilotContactSummaryForClient(clientId),
    getClientMailboxMutationAllowed(staff, client.id),
    getRecentMailboxAuthFailuresForClient(clientId),
    getLatestProvenSendAt(clientId),
  ]);

  const oauthMicrosoftReady = isMicrosoftMailboxOAuthConfigured();
  const oauthGoogleReady = isGoogleMailboxOAuthConfigured();
  const googleSaDisplay = getGoogleServiceAccountDisplayInfo();
  const googleSheetsEnvReady = googleSaDisplay.configured;
  const rocketReachEnvReady = !!process.env.ROCKETREACH_API_KEY?.trim();

  const hasGovernedMailbox = governedMailbox.mode === "governed";
  const oauthReadyForGovernedTest =
    governedMailbox.mode === "governed"
      ? governedMailbox.mailbox.provider === "GOOGLE"
        ? oauthGoogleReady
        : oauthMicrosoftReady
      : false;

  const currentUtcWindowKey = utcDateKeyForInstant(new Date());
  const sendingReadinessByMailboxId = Object.fromEntries(
    sendingReadiness.map((s) => [s.mailboxId, s]),
  );

  // Link-alignment status per mailbox, resolved HERE because it needs the
  // environment (the platform's own hostnames) and the panel is a client
  // component. The client's whole domain set is used, not just the one mailbox's,
  // so a signature linking to the client's website or verified link domain reads
  // as aligned rather than as a warning.
  const clientOwnDomains = ownDomainsFor({
    mailboxEmails: client.mailboxIdentities.map((m) => m.email),
    website: client.website,
    outreachLinkDomain: client.outreachLinkDomain,
  });
  const platformDomains = appDomainsFromEnv();

  const mailboxRows = client.mailboxIdentities.map((m) => {
    const authFailure = recentMailboxAuthFailures.get(m.id) ?? null;
    const applyAuthOverlay = shouldApplyMailboxAuthFailureOverlay({
      dbConnectionStatus: m.connectionStatus,
      connectedAt: m.connectedAt,
      mailboxUpdatedAt: m.updatedAt,
      failure: authFailure,
    });
    const connectionStatus = applyAuthOverlay ? "CONNECTION_ERROR" : m.connectionStatus;
    const lastError =
      applyAuthOverlay && authFailure
        ? mailboxReauthMessage(m.provider, authFailure.message)
        : m.lastError;
    return {
    id: m.id,
    email: m.email,
    displayName: m.displayName,
    provider: m.provider,
    connectionStatus,
    providerLinkedUserId: m.providerLinkedUserId,
    connectedAt: m.connectedAt?.toISOString() ?? null,
    workspaceRemovedAt: m.workspaceRemovedAt?.toISOString() ?? null,
    isActive: m.isActive,
    isPrimary: m.isPrimary,
    canSend: m.canSend,
    canReceive: m.canReceive,
    dailySendCap: m.dailySendCap,
    isSendingEnabled: m.isSendingEnabled,
    emailsSentToday: m.emailsSentToday,
    dailyWindowResetAt: m.dailyWindowResetAt?.toISOString() ?? null,
    lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    lastError,
    // Carried so the Mailboxes screen can tell an in-flight sign-in from one
    // that closed weeks ago. Not a secret: it is a timestamp, never the
    // `oauthState` token itself, which must not reach the browser.
    oauthStateExpiresAt: m.oauthStateExpiresAt?.toISOString() ?? null,
    updatedAt: m.updatedAt.toISOString(),
    senderDisplayName: m.senderDisplayName,
    senderPhone: m.senderPhone,
    senderSignatureHtml: m.senderSignatureHtml,
    senderSignatureText: m.senderSignatureText,
    senderSignatureSource: m.senderSignatureSource,
    senderSignatureSyncedAt: m.senderSignatureSyncedAt?.toISOString() ?? null,
    senderSignatureSyncError: m.senderSignatureSyncError,
    signatureLinkStatus: signatureLinkStatusFor({
      email: m.email,
      senderSignatureHtml: m.senderSignatureHtml,
      senderSignatureText: m.senderSignatureText,
      ownDomains: clientOwnDomains,
      appDomains: platformDomains,
    }),
    };
  });

  const graphInboxRows = graphInbox.map((m) => ({
    id: m.id,
    fromEmail: m.fromEmail,
    toEmail: m.toEmail,
    subject: m.subject,
    bodyPreview: m.bodyPreview,
    receivedAt: m.receivedAt.toISOString(),
    conversationId: m.conversationId,
    hasFullBody: !!(m.bodyText && m.bodyText.trim().length > 0),
    mailbox: m.mailbox,
  }));

  const connectedMailboxInbox = client.mailboxIdentities
    .filter(
      (m) =>
        !m.workspaceRemovedAt &&
        (m.provider === "MICROSOFT" || m.provider === "GOOGLE") &&
        m.connectionStatus === "CONNECTED",
    )
    .map((m) => ({
      id: m.id,
      email: m.email,
      label: m.displayName?.trim() ? m.displayName : m.email,
      provider: m.provider,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    }));

  const senderReport = describeSenderReadiness({
    defaultSenderEmail: client.defaultSenderEmail,
    senderIdentityStatus: client.senderIdentityStatus,
    outreachMailboxes: mailboxRows.map((m) => ({
      email: m.email,
      isActive: m.isActive,
      connectionStatus: m.connectionStatus,
      canSend: m.canSend,
      isSendingEnabled: m.isSendingEnabled,
      workspaceRemovedAt: m.workspaceRemovedAt ? new Date(m.workspaceRemovedAt) : null,
    })),
  });

  const brief = parseOpensDoorsBrief(client.onboarding?.formData);

  const taxono = {
    SERVICE_AREA: 0,
    TARGET_INDUSTRY: 0,
    COMPANY_SIZE: 0,
    JOB_TITLE: 0,
  };
  for (const link of client.briefTaxonomyLinks) {
    switch (link.term.kind) {
      case "SERVICE_AREA":
        taxono.SERVICE_AREA += 1;
        break;
      case "TARGET_INDUSTRY":
        taxono.TARGET_INDUSTRY += 1;
        break;
      case "COMPANY_SIZE":
        taxono.COMPANY_SIZE += 1;
        break;
      case "JOB_TITLE":
        taxono.JOB_TITLE += 1;
        break;
      default:
        break;
    }
  }

  const onboardingCompletion = computeOnboardingBriefCompletion(client.onboarding?.formData, {
    client: {
      name: client.name,
      website: client.website,
      industry: client.industry,
      briefBusinessAddress: client.briefBusinessAddress,
      briefMainContact: client.briefMainContact,
      briefLinkedinUrl: client.briefLinkedinUrl,
      briefAssignedAccountManagerId: client.briefAssignedAccountManagerId,
    },
    taxonomyCounts: taxono,
  });
  const suppressionSheetRows = client.suppressionSources.filter((s) => !!s.spreadsheetId?.trim());

  const governedReadiness =
    governedMailbox.mode === "governed"
      ? sendingReadiness.find((s) => s.mailboxId === governedMailbox.mailbox.id)
      : undefined;

  const connectedSendingMailboxes = client.mailboxIdentities.filter((m) =>
    isMailboxExecutionEligible(m),
  );
  const connectedSendingCount = connectedSendingMailboxes.length;
  // F1 — count connected sending mailboxes with NO signature configured. The
  // signature is a property of the sending account and appended to every
  // send; chooseSignatureForSend is the same resolver the send path uses.
  const sendingMailboxesMissingSignature = connectedSendingMailboxes.filter(
    (m) =>
      (
        chooseSignatureForSend({
          mailbox: m,
          clientBrief: {
            senderDisplayNameFallback: null,
            emailSignatureFallback: null,
          },
        }).emailSignatureText ?? ""
      ).trim().length === 0,
  ).length;
  const aggregateRemaining = sumAggregateRemainingAcrossEligible(sendingReadiness);
  const maxRecommendedCapacityMet = connectedSendingCount >= REQUIRED_OUTREACH_MAILBOX_COUNT;
  const poolCanSendPilot = aggregateRemaining >= 1;

  const pilotPrerequisites = {
    clientActive: client.status === "ACTIVE",
    contactCount: client._count.contacts,
    hasGovernedMailbox,
    oauthReady: oauthReadyForGovernedTest,
    governedMailboxEmail:
      governedMailbox.mode === "governed" ? governedMailbox.mailbox.email : null,
    cap: governedReadiness?.cap ?? OUTREACH_MAILBOX_DAILY_CAP,
    bookedInUtcDay: governedReadiness?.bookedInUtcDay ?? 0,
    remaining: governedReadiness?.remaining ?? 0,
    eligible: governedReadiness?.eligible ?? false,
    ineligibleReason: governedReadiness?.ineligibleCode
      ? governedReadiness.ineligibleCode.replace(/_/g, " ")
      : null,
    recommendedMaxConnectedMailboxes: REQUIRED_OUTREACH_MAILBOX_COUNT,
    connectedSendingCount,
    aggregateRemaining,
    theoreticalMaxDaily: THEORETICAL_MAX_CLIENT_DAILY_SENDS,
    perMailboxCap: OUTREACH_MAILBOX_DAILY_CAP,
    maxRecommendedCapacityMet,
    poolCanSendPilot,
    pilotAllocationMode: "mailbox_pool" as const,
  };

  // The client's activity signal: when did this workspace last provably send
  // an email — ANY email, through any channel.
  //
  // This used to be `recentGovernedSends[0]`, which only ever contained
  // governed-proof and pilot sends. Real sequence outreach carries a different
  // metadata kind, so it never appeared, and the Overview said "Activity — not
  // started" about a client whose own Activity tab said "Emails sent 1". Both
  // now read `proven-send.ts`, and a test fails if they part company again.
  // Renamed deliberately: the old name was `latestGovernedAt`, and that name is
  // what let two readers believe it meant "any activity" when it never did.
  const latestProvenSendAtIso = latestProvenSendAt
    ? latestProvenSendAt.toISOString()
    : null;

  return {
    client,
    graphInboxRows,
    sendingReadiness,
    sendingReadinessByMailboxId,
    recentGovernedSends,
    pilotContactSummary,
    oauthMicrosoftReady,
    oauthGoogleReady,
    googleSaDisplay,
    googleSheetsEnvReady,
    rocketReachEnvReady,
    governedMailbox,
    hasGovernedMailbox,
    oauthReadyForGovernedTest,
    currentUtcWindowKey,
    mailboxRows,
    connectedMailboxInbox,
    senderReport,
    brief,
    onboardingCompletion,
    suppressionSheetRows,
    governedReadiness,
    connectedSendingCount,
    sendingMailboxesMissingSignature,
    aggregateRemaining,
    maxRecommendedCapacityMet,
    poolCanSendPilot,
    pilotPrerequisites,
    canMutateMailboxes,
    latestProvenSendAtIso,
    controlledPilotHardMaxRecipients: CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
  };
}
