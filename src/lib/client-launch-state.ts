import type { OnboardingBriefCompletion } from "@/lib/opensdoors-brief";
import {
  OUTREACH_MAILBOX_DAILY_CAP,
  getOutreachMailboxCapacityTier,
} from "@/lib/outreach-mailbox-model";

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
  /**
   * Optional PR D4b signal: count of APPROVED `ClientEmailSequence` rows for
   * this client. Kept optional so older callers still type-check; defaults to
   * 0 when absent. Consumers only surface this in metric text — it does not
   * currently flip the outreach pill from "ready" to "needs attention" on its
   * own because sending is not yet wired to sequences.
   */
  approvedSequencesCount?: number;
  /**
   * Optional PR D4b signal: count of APPROVED `ClientEmailTemplate` rows with
   * category `INTRODUCTION`. Optional for the same reason as above.
   */
  approvedIntroductionTemplatesCount?: number;
};

/** Status pill for the compact Launch readiness panel (UI copy). */
export type LaunchReadinessPillStatus =
  | "ready"
  | "needs_attention"
  | "not_started"
  | "reduced_capacity"
  | "monitoring";

export type LaunchReadinessRow = {
  id: string;
  label: string;
  pillStatus: LaunchReadinessPillStatus;
  metric: string;
  href: string;
  actionLabel: string;
};

export type LaunchReadinessPanelInput = ClientLaunchSnapshotInput & {
  /** Latest `lastSyncedAt` across suppression sources, if any. */
  suppressionLatestSyncAt: Date | null;
};

export function launchReadinessPillLabel(status: LaunchReadinessPillStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "needs_attention":
      return "Needs attention";
    case "not_started":
      return "Not started";
    case "reduced_capacity":
      return "Reduced capacity";
    case "monitoring":
      return "Monitoring";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Compact per-module rows for the client overview “Launch readiness” card (UI only).
 */
export function buildLaunchReadinessRows(input: LaunchReadinessPanelInput): LaunchReadinessRow[] {
  const base = `/clients/${input.clientId}`;
  const brief = input.brief;
  const dailyCapacity = input.connectedSendingCount * OUTREACH_MAILBOX_DAILY_CAP;
  const mailboxTier = getOutreachMailboxCapacityTier(input.connectedSendingCount);

  const briefRow = ((): LaunchReadinessRow => {
    const pct = brief.percent;
    let pill: LaunchReadinessPillStatus;
    if (brief.status === "ready") pill = "ready";
    else if (brief.status === "partial") pill = "needs_attention";
    else pill = "not_started";
    return {
      id: "brief",
      label: "Brief",
      pillStatus: pill,
      metric: `${String(pct)}% complete`,
      href: `${base}/brief`,
      actionLabel: "Open brief",
    };
  })();

  const mailboxesRow = ((): LaunchReadinessRow => {
    let pill: LaunchReadinessPillStatus;
    if (input.connectedSendingCount <= 0) pill = "not_started";
    else if (mailboxTier === "max_recommended") pill = "ready";
    else pill = "reduced_capacity";
    return {
      id: "mailboxes",
      label: "Mailboxes",
      pillStatus: pill,
      metric: `${String(input.connectedSendingCount)} connected · ${String(dailyCapacity)}/day capacity`,
      href: `${base}/mailboxes`,
      actionLabel: "Open mailboxes",
    };
  })();

  const sourcesRow = ((): LaunchReadinessRow => {
    const ok = input.rocketReachEnvReady;
    return {
      id: "sources",
      label: "Sources",
      pillStatus: ok ? "ready" : "needs_attention",
      metric: ok ? "RocketReach ready" : "API missing",
      href: `${base}/sources`,
      actionLabel: "Open sources",
    };
  })();

  const suppressionRow = ((): LaunchReadinessRow => {
    if (input.suppressionSheetCount === 0) {
      return {
        id: "suppression",
        label: "Suppression",
        pillStatus: "not_started",
        metric: "Not configured",
        href: `${base}/suppression`,
        actionLabel: "Open suppression",
      };
    }
    if (!input.googleSheetsEnvReady) {
      return {
        id: "suppression",
        label: "Suppression",
        pillStatus: "needs_attention",
        metric: "Google API missing",
        href: `${base}/suppression`,
        actionLabel: "Open suppression",
      };
    }
    if (!input.suppressionLatestSyncAt) {
      return {
        id: "suppression",
        label: "Suppression",
        pillStatus: "needs_attention",
        metric: "Needs sync",
        href: `${base}/suppression`,
        actionLabel: "Open suppression",
      };
    }
    return {
      id: "suppression",
      label: "Suppression",
      pillStatus: "ready",
      metric: "Synced",
      href: `${base}/suppression`,
      actionLabel: "Open suppression",
    };
  })();

  const contactsRow = ((): LaunchReadinessRow => {
    let pill: LaunchReadinessPillStatus;
    if (input.contactsTotal <= 0) pill = "not_started";
    else if (input.contactsEligible >= 1) pill = "ready";
    else pill = "needs_attention";
    return {
      id: "contacts",
      label: "Contacts",
      pillStatus: pill,
      metric: `${String(input.contactsTotal)} total · ${String(input.contactsEligible)} eligible`,
      href: `${base}/contacts`,
      actionLabel: "Open contacts",
    };
  })();

  const approvedSequences = input.approvedSequencesCount ?? 0;
  const approvedIntroTemplates = input.approvedIntroductionTemplatesCount ?? 0;

  const outreachRow = ((): LaunchReadinessRow => {
    const sequenceHint =
      approvedSequences > 0
        ? ` · ${String(approvedSequences)} approved sequence${approvedSequences === 1 ? "" : "s"}`
        : approvedIntroTemplates > 0
          ? " · sequence pending approval"
          : "";
    if (input.outreachPilotRunnable) {
      return {
        id: "outreach",
        label: "Outreach",
        pillStatus: "ready",
        metric: `Pilot ready${sequenceHint}`,
        href: `${base}/outreach`,
        actionLabel: "Open outreach",
      };
    }
    if (input.contactsEligible < 1) {
      return {
        id: "outreach",
        label: "Outreach",
        pillStatus: "needs_attention",
        metric: "Needs eligible contact",
        href: `${base}/outreach`,
        actionLabel: "Open outreach",
      };
    }
    return {
      id: "outreach",
      label: "Outreach",
      pillStatus: "needs_attention",
      metric: "Check mailboxes & OAuth",
      href: `${base}/outreach`,
      actionLabel: "Open outreach",
    };
  })();

  const activityRow = ((): LaunchReadinessRow => {
    const has = input.latestActivityLabel != null;
    return {
      id: "activity",
      label: "Activity",
      pillStatus: has ? "monitoring" : "not_started",
      metric: has ? "Recent sends available" : "No activity yet",
      href: `${base}/activity`,
      actionLabel: "Open activity",
    };
  })();

  return [briefRow, mailboxesRow, sourcesRow, suppressionRow, contactsRow, outreachRow, activityRow];
}

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
