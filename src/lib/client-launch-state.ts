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
   * True when at least one non-archived sequence passes the production launch
   * rail (`evaluateSequenceLaunchReadiness`) — an introduction step on an
   * active template, a list, recipients and compliance.
   *
   * REQUIRED, deliberately. It and `enrolledContactsCount` are the two signals
   * {@link isOutreachModuleReady} needs, and both were previously optional and
   * silently dropped by the caller. An optional field defaulting to "not
   * ready" fails closed, but it fails closed SILENTLY — the screen would just
   * be wrong in the other direction and nobody would know. Required means the
   * compiler refuses to build a caller that forgets to wire it.
   */
  hasProductionLaunchableSequence: boolean;
  /**
   * Count of `ClientEmailSequenceEnrollment` rows for this client. Required
   * for the same reason as above.
   */
  enrolledContactsCount: number;
};

/**
 * Is the Outreach module genuinely ready to launch?
 *
 * ## Why this predicate exists
 *
 * It used to be `outreachPilotRunnable` alone, in four separate places. That
 * boolean is `hasGovernedMailbox && oauthReadyForGovernedTest &&
 * poolCanSendPilot` — it is a fact about MAILBOXES. It asks "could a governed
 * mailbox send something today?" and never looks at sequences, steps or
 * enrolments.
 *
 * So on 2026-08-26 the `bidlowai` workspace showed a green "Ready to launch"
 * badge, a "6 Outreach — complete" pill and a readiness row reading "Ready to
 * launch", while its own Outreach tab said "No sequences yet." and its own
 * Getting-started checklist said "5 / 8 complete" — one screen contradicting
 * itself three ways.
 *
 * Meanwhile `evaluateClientLaunchApproval` — the gate that actually decides
 * whether a client may go live — has always required a launchable sequence AND
 * at least one enrolment. The rail was reporting Ready for clients the gate
 * would have refused.
 *
 * This is that gate's condition, extracted so the display and the gate are the
 * same boolean and cannot drift apart again. Fails closed: an omitted signal
 * counts as not-ready.
 */
export function isOutreachModuleReady(
  input: Pick<
    ClientLaunchSnapshotInput,
    "outreachPilotRunnable" | "hasProductionLaunchableSequence" | "enrolledContactsCount"
  >,
): boolean {
  return (
    input.outreachPilotRunnable &&
    input.hasProductionLaunchableSequence === true &&
    (input.enrolledContactsCount ?? 0) >= 1
  );
}

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
    const row = (pillStatus: LaunchReadinessPillStatus, metric: string): LaunchReadinessRow => ({
      id: "outreach",
      label: "Outreach",
      pillStatus,
      metric,
      href: `${base}/outreach`,
      actionLabel: "Open outreach",
    });

    // Ready means ready: a mailbox that can send, a sequence that passes the
    // launch rail, and somebody enrolled to receive it. See isOutreachModuleReady.
    if (isOutreachModuleReady(input)) {
      return row("ready", "Ready to launch · launchable production sequence");
    }

    // Not ready — say which of the three is missing, most-fundamental first,
    // so the operator has somewhere to go rather than a bare "not ready".
    if (input.contactsEligible < 1) {
      return row("needs_attention", "Needs eligible contact");
    }
    if (!hasLaunchable) {
      // Keep the approval-progress hint: "no launchable sequence" and "a
      // sequence exists but hasn't passed the rail" are different situations.
      const hint =
        approvedSequences > 0
          ? ` · ${String(approvedSequences)} approved sequence${approvedSequences === 1 ? "" : "s"}`
          : approvedIntroTemplates > 0
            ? " · sequence pending approval"
            : "";
      return row("needs_attention", `Needs a launchable sequence${hint}`);
    }
    if ((input.enrolledContactsCount ?? 0) < 1) {
      return row("needs_attention", "Sequence ready · no recipients enrolled yet");
    }
    return row("needs_attention", "Check mailbox connections");
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
  if (input.brief.status === "ready" && isOutreachModuleReady(input)) {
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
  // Setup is otherwise done — name the outreach work that is actually left,
  // rather than the catch-all "In setup" that told bidlowai nothing.
  if (input.hasProductionLaunchableSequence !== true) {
    return "Build a sequence";
  }
  if ((input.enrolledContactsCount ?? 0) < 1) {
    return "Enroll recipients";
  }
  return "In setup";
}

