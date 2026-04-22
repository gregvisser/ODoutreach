import "server-only";

import { CONTROLLED_PILOT_HARD_MAX_RECIPIENTS } from "@/lib/controlled-pilot-constants";
import {
  computeOnboardingBriefCompletion,
  parseOpensDoorsBrief,
} from "@/lib/opensdoors-brief";
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
  loadGovernedSendingMailbox,
} from "@/server/mailbox/sending-policy";
import { getClientByIdForStaff } from "@/server/queries/clients";
import { getRecentInboundMailboxMessagesForClient } from "@/server/queries/mailbox-inbox";
import { getMailboxSendingReadinessForClient } from "@/server/queries/mailbox-sending-readiness";
import { getRecentGovernedSendsForClient } from "@/server/queries/governed-send-ledger";
import { getPilotContactSummaryForClient } from "@/server/queries/pilot-contact-summary";
import type { StaffUser } from "@/generated/prisma/client";

export type ClientWorkspaceBundle = Awaited<ReturnType<typeof loadClientWorkspaceBundle>>;

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

  const [
    graphInbox,
    sendingReadiness,
    recentGovernedSends,
    pilotContactSummary,
    governedMailbox,
    canMutateMailboxes,
  ] = await Promise.all([
    getRecentInboundMailboxMessagesForClient(clientId, 50),
    getMailboxSendingReadinessForClient(clientId, client.mailboxIdentities),
    getRecentGovernedSendsForClient(clientId, 25),
    getPilotContactSummaryForClient(clientId),
    loadGovernedSendingMailbox(clientId),
    getClientMailboxMutationAllowed(staff, client.id),
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

  const mailboxRows = client.mailboxIdentities.map((m) => ({
    id: m.id,
    email: m.email,
    displayName: m.displayName,
    provider: m.provider,
    connectionStatus: m.connectionStatus,
    providerLinkedUserId: m.providerLinkedUserId,
    connectedAt: m.connectedAt?.toISOString() ?? null,
    isActive: m.isActive,
    isPrimary: m.isPrimary,
    canSend: m.canSend,
    canReceive: m.canReceive,
    dailySendCap: m.dailySendCap,
    isSendingEnabled: m.isSendingEnabled,
    emailsSentToday: m.emailsSentToday,
    dailyWindowResetAt: m.dailyWindowResetAt?.toISOString() ?? null,
    lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    lastError: m.lastError,
    updatedAt: m.updatedAt.toISOString(),
  }));

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
        (m.provider === "MICROSOFT" || m.provider === "GOOGLE") &&
        m.connectionStatus === "CONNECTED",
    )
    .map((m) => ({
      id: m.id,
      email: m.email,
      label: m.displayName?.trim() ? m.displayName : m.email,
      provider: m.provider,
    }));

  const senderReport = describeSenderReadiness({
    defaultSenderEmail: client.defaultSenderEmail,
    senderIdentityStatus: client.senderIdentityStatus,
  });

  const brief = parseOpensDoorsBrief(client.onboarding?.formData);
  const onboardingCompletion = computeOnboardingBriefCompletion(client.onboarding?.formData);
  const suppressionSheetRows = client.suppressionSources.filter((s) => !!s.spreadsheetId?.trim());

  const governedReadiness =
    governedMailbox.mode === "governed"
      ? sendingReadiness.find((s) => s.mailboxId === governedMailbox.mailbox.id)
      : undefined;

  const connectedSendingMailboxes = client.mailboxIdentities.filter((m) =>
    isMailboxExecutionEligible(m),
  );
  const connectedSendingCount = connectedSendingMailboxes.length;
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

  const latestGovernedAt =
    recentGovernedSends.length > 0 ? recentGovernedSends[0]!.createdAtIso : null;

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
    aggregateRemaining,
    maxRecommendedCapacityMet,
    poolCanSendPilot,
    pilotPrerequisites,
    canMutateMailboxes,
    latestGovernedAt,
    controlledPilotHardMaxRecipients: CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
  };
}
