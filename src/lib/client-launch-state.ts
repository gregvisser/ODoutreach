import type { OnboardingBriefCompletion } from "@/lib/opensdoors-brief";

export type WorkflowStepStatus = "not_started" | "needs_attention" | "ready" | "complete";

export type ClientWorkflowStep = {
  id: string;
  label: string;
  status: WorkflowStepStatus;
  metric: string;
  href: string;
};

export type ClientLaunchSnapshotInput = {
  clientId: string;
  brief: OnboardingBriefCompletion;
  connectedSendingCount: number;
  recommendedMailboxCount: number;
  suppressionSheetCount: number;
  googleSheetsEnvReady: boolean;
  contactsTotal: number;
  contactsEligible: number;
  contactsSuppressedCount: number;
  rocketReachEnvReady: boolean;
  outreachPilotRunnable: boolean;
  /** ISO or human-readable */
  latestActivityLabel: string | null;
};

/** One-line status for the command center header. */
export function deriveLaunchStageLabel(input: ClientLaunchSnapshotInput): string {
  if (input.brief.status === "ready" && input.outreachPilotRunnable) {
    return "Pilot-ready";
  }
  if (input.brief.status === "empty") {
    return "Brief not started";
  }
  if (!input.suppressionSheetCount) {
    return "Configure suppression";
  }
  if (input.connectedSendingCount < 1) {
    return "Connect mailboxes";
  }
  return "In setup";
}

function stepStatus(
  complete: boolean,
  needsAttention: boolean,
  started: boolean,
): WorkflowStepStatus {
  if (complete) return "complete";
  if (needsAttention) return "needs_attention";
  if (started) return "ready";
  return "not_started";
}

/**
 * Maps production metrics to the seven-step client operating pathway (UI only).
 */
export function buildClientWorkflowSteps(input: ClientLaunchSnapshotInput): ClientWorkflowStep[] {
  const base = `/clients/${input.clientId}`;
  const brief = input.brief;

  const briefComplete = brief.status === "ready";
  const briefStarted = brief.status !== "empty";

  const mailboxesComplete =
    input.connectedSendingCount >= input.recommendedMailboxCount;
  const mailboxesStarted = input.connectedSendingCount >= 1;

  const sourcesOk = input.rocketReachEnvReady;
  const sourcesStarted = sourcesOk;

  const suppressionComplete =
    input.suppressionSheetCount > 0 && input.googleSheetsEnvReady;
  const suppressionStarted = input.suppressionSheetCount > 0;

  const contactsComplete = input.contactsTotal > 0 && input.contactsEligible >= 1;
  const contactsStarted = input.contactsTotal > 0;

  const outreachComplete = input.outreachPilotRunnable;
  const outreachStarted =
    input.outreachPilotRunnable ||
    (input.connectedSendingCount >= 1 && input.contactsTotal > 0);

  const activityComplete = input.latestActivityLabel != null;
  const activityStarted = activityComplete;

  return [
    {
      id: "brief",
      label: "Brief",
      status: stepStatus(briefComplete, brief.status === "partial", briefStarted),
      metric: briefComplete
        ? "Brief complete"
        : `${String(brief.completedCount)}/${String(brief.totalCount)} fields`,
      href: `${base}/brief`,
    },
    {
      id: "mailboxes",
      label: "Mailboxes",
      status: stepStatus(
        mailboxesComplete,
        !mailboxesStarted || input.connectedSendingCount < input.recommendedMailboxCount,
        mailboxesStarted,
      ),
      metric: `${String(input.connectedSendingCount)}/${String(input.recommendedMailboxCount)} sending`,
      href: `${base}/mailboxes`,
    },
    {
      id: "sources",
      label: "Sources",
      status: stepStatus(sourcesOk, !sourcesOk, sourcesStarted),
      metric: input.rocketReachEnvReady ? "Import provider ready" : "Env not configured",
      href: `${base}/sources`,
    },
    {
      id: "suppression",
      label: "Suppression",
      status: stepStatus(
        suppressionComplete,
        input.suppressionSheetCount === 0 || !input.googleSheetsEnvReady,
        suppressionStarted,
      ),
      metric:
        input.suppressionSheetCount > 0
          ? `${String(input.suppressionSheetCount)} Sheet source(s)`
          : "No Sheet ids",
      href: `${base}/suppression`,
    },
    {
      id: "contacts",
      label: "Contacts",
      status: stepStatus(contactsComplete, input.contactsTotal === 0, contactsStarted),
      metric: `${String(input.contactsEligible)} eligible · ${String(input.contactsSuppressedCount)} suppressed`,
      href: `${base}/contacts`,
    },
    {
      id: "outreach",
      label: "Outreach",
      status: stepStatus(outreachComplete, !input.outreachPilotRunnable, outreachStarted),
      metric: input.outreachPilotRunnable ? "Pilot can run" : "Check prerequisites",
      href: `${base}/outreach`,
    },
    {
      id: "activity",
      label: "Activity",
      status: stepStatus(activityComplete, false, activityStarted),
      metric: input.latestActivityLabel ?? "No recent sends",
      href: `${base}/activity`,
    },
  ];
}
