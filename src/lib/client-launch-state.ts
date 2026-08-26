import type { OnboardingBriefCompletion } from "@/lib/opensdoors-brief";
import {
  OUTREACH_MAILBOX_DAILY_CAP,
  getOutreachMailboxCapacityTier,
} from "@/lib/outreach-mailbox-model";

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
  /**
   * When true, at least one sequence passes the production launch rail (same
   * as Outreach). Preferred over approved* counts for UI metrics.
   */
  hasProductionLaunchableSequence?: boolean;
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
      metric: ok ? "RocketReach ready" : "RocketReach not connected",
      href: `${base}/sources`,
      actionLabel: "Open sources",
    };
  })();

  const suppressionRow = ((): LaunchReadinessRow => {
    if (input.suppressionSheetCount === 0) {
      return {
        id: "suppression",
        label: "Do-not-contact",
        pillStatus: "not_started",
        metric: "Not configured",
        href: `${base}/suppression`,
        actionLabel: "Open suppression",
      };
    }
    if (!input.googleSheetsEnvReady) {
      return {
        id: "suppression",
        label: "Do-not-contact",
        pillStatus: "needs_attention",
        metric: "Google Sheets not connected",
        href: `${base}/suppression`,
        actionLabel: "Open suppression",
      };
    }
    if (!input.suppressionLatestSyncAt) {
      return {
        id: "suppression",
        label: "Do-not-contact",
        pillStatus: "needs_attention",
        metric: "Needs sync",
        href: `${base}/suppression`,
        actionLabel: "Open suppression",
      };
    }
    return {
      id: "suppression",
      label: "Do-not-contact",
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
      label: "Lists",
      pillStatus: pill,
      metric: `${String(input.contactsTotal)} total · ${String(input.contactsEligible)} eligible`,
      href: `${base}/contacts`,
      actionLabel: "Open contacts",
    };
  })();

  const approvedSequences = input.approvedSequencesCount ?? 0;
  const approvedIntroTemplates = input.approvedIntroductionTemplatesCount ?? 0;
  const hasLaunchable = input.hasProductionLaunchableSequence === true;

  const outreachRow = ((): LaunchReadinessRow => {
    const sequenceHint = hasLaunchable
      ? " · launchable sequence"
      : approvedSequences > 0
        ? ` · ${String(approvedSequences)} approved sequence${approvedSequences === 1 ? "" : "s"}`
        : approvedIntroTemplates > 0
          ? " · sequence pending approval"
          : "";
    if (input.outreachPilotRunnable) {
      return {
        id: "outreach",
        label: "Outreach",
        pillStatus: "ready",
        metric: hasLaunchable
          ? "Ready to launch · launchable production sequence"
          : `Ready to launch${sequenceHint}`,
        href: `${base}/outreach`,
        actionLabel: "Open outreach",
      };
    }
    if (hasLaunchable) {
      return {
        id: "outreach",
        label: "Outreach",
        pillStatus: "ready",
        metric: "Launchable production sequence",
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
      metric: "Check mailbox connections",
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
      metric: has
        ? "Recent sends available"
        : "No outreach activity yet — expected before first send",
      href: `${base}/activity`,
      actionLabel: "Open activity",
    };
  })();

  return [briefRow, mailboxesRow, sourcesRow, suppressionRow, contactsRow, outreachRow, activityRow];
}

/** One-line status for the command center header. */
export function deriveLaunchStageLabel(input: ClientLaunchSnapshotInput): string {
  if (input.brief.status === "ready" && input.outreachPilotRunnable) {
    return "Ready to launch";
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

