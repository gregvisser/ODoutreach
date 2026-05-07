/**
 * PR K — Client launch approval policy.
 *
 * Pure helper that decides whether an authorised operator may approve
 * a client's launch from the workspace overview. The helper is
 * deliberately dependency-free so it can run in server actions, the
 * UI card, and unit tests without pulling in Prisma or React.
 *
 * Approval does NOT send any email. It records:
 *   - who approved
 *   - when they approved
 *   - which approval mode (controlled internal vs live prospect)
 *   - a checklist snapshot captured at approval time
 *   - optional free-text notes
 *
 * The helper is the single source of truth for the blockers/warnings
 * shown in the "Launch approval" card AND for the server-side re-check
 * that runs inside {@link approveClientLaunchAction}. The UI must not
 * approve what the server would reject.
 */
import type { ClientLifecycleStatus } from "@/generated/prisma/enums";

import type { LaunchReadinessRow } from "@/lib/client-launch-state";
import type { GettingStartedViewModel } from "@/lib/clients/getting-started-view-model";

/**
 * Approval mode.
 *
 * CONTROLLED_INTERNAL — current operational reality: the outreach
 * pipeline can only target OpensDoors-allowlisted recipients today.
 * One-click unsubscribe is not implemented yet, which is acceptable for
 * this mode.
 *
 * LIVE_PROSPECT — reserved for a future PR that wires up real prospect
 * sending. It is surfaced in types so callers can reason about it, but
 * the UI only exposes CONTROLLED_INTERNAL in PR K.
 */
export type ClientLaunchApprovalMode = "CONTROLLED_INTERNAL" | "LIVE_PROSPECT";

/** Admin UI label for stored enum values (never show raw `CONTROLLED_INTERNAL` to operators). */
export function humanizeClientLaunchApprovalMode(
  mode: string | null | undefined,
): string {
  if (mode === "CONTROLLED_INTERNAL") return "Controlled internal rollout";
  if (mode === "LIVE_PROSPECT") return "Live prospect sending";
  if (mode == null || String(mode).trim() === "") return "—";
  return String(mode);
}

/** Confirmation phrase the operator must type verbatim. */
export const LAUNCH_APPROVAL_CONFIRMATION_PHRASE = "APPROVE LAUNCH";

/** Maximum length of the optional free-text approval notes field. */
export const LAUNCH_APPROVAL_NOTES_MAX = 2000;

export type LaunchApprovalChecklistItemId =
  | "brief"
  | "mailbox"
  | "suppression"
  | "contacts"
  | "template"
  | "sequence"
  | "enrollment"
  | "sender_signature"
  | "launch_readiness"
  | "one_click_unsubscribe";

export type LaunchApprovalChecklistItem = {
  id: LaunchApprovalChecklistItemId;
  label: string;
  ok: boolean;
  detail: string;
};

export type LaunchApprovalPolicyInput = {
  clientStatus: ClientLifecycleStatus | string;
  gettingStarted: Pick<GettingStartedViewModel, "items">;
  readinessRows: ReadonlyArray<
    Pick<LaunchReadinessRow, "id" | "label" | "pillStatus">
  >;
  /**
   * At least one non-archived sequence passes
   * `evaluateSequenceLaunchReadiness` (templates may be DRAFT; APPROVED not
   * required).
   */
  hasProductionLaunchableSequence: boolean;
  enrolledContactsCount: number;
  hasSenderSignature: boolean;
  /**
   * `true` when one-click unsubscribe is wired up end-to-end. Today this
   * is always `false` — the helper still accepts the flag so a future PR
   * can flip it without touching call sites.
   */
  oneClickUnsubscribeReady: boolean;
  mode: ClientLaunchApprovalMode;
};

export type LaunchApprovalPolicyResult = {
  canApprove: boolean;
  blockers: string[];
  warnings: string[];
  checklist: LaunchApprovalChecklistItem[];
};

/**
 * Build the launch-approval checklist + blockers/warnings for a client.
 *
 * The checklist snapshot is stored verbatim on `Client.launchApprovalChecklist`
 * when approval succeeds so the approval trail is auditable later even if
 * modules change.
 */
export function evaluateClientLaunchApproval(
  input: LaunchApprovalPolicyInput,
): LaunchApprovalPolicyResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const byId = Object.fromEntries(
    input.gettingStarted.items.map((item) => [item.id, item] as const),
  );
  const briefDone = byId.brief?.done ?? false;
  const mailboxesDone = byId.mailboxes?.done ?? false;
  const suppressionDone = byId.suppression?.done ?? false;
  const contactsDone = byId.contacts?.done ?? false;
  const enrollmentsDone = byId.enrollments?.done ?? false;

  // Status gate — only ONBOARDING / PAUSED can be approved for launch.
  // ACTIVE means it is already live; ARCHIVED is soft-deleted.
  const status = String(input.clientStatus);
  if (status === "ACTIVE") {
    blockers.push("Client is already ACTIVE.");
  } else if (status === "ARCHIVED") {
    blockers.push("Client is ARCHIVED and cannot be launched.");
  }

  if (!briefDone) {
    blockers.push("Business brief is not complete.");
  }
  if (!mailboxesDone) {
    blockers.push("No sending mailbox is connected.");
  }
  if (!suppressionDone) {
    blockers.push("Suppression is not configured.");
  }
  if (!contactsDone) {
    blockers.push("No contacts are loaded.");
  }
  if (!input.hasProductionLaunchableSequence) {
    blockers.push(
      "No launchable production sequence — open Outreach and pass the sequence launch checks (introduction step, active templates, enrollments, and compliance on the launch rail).",
    );
  }
  if (!enrollmentsDone || input.enrolledContactsCount < 1) {
    blockers.push("No sequence enrollments.");
  }
  if (!input.hasSenderSignature) {
    blockers.push("A sender signature is not configured on any connected mailbox.");
  }

  // Launch readiness: same as the overview "Launch readiness" card, but
  // the Activity row is informational for first-time activation (no
  // proof send is required to flip the client ACTIVE).
  const nonActivityReadinessBlockers = input.readinessRows.filter(
    (row) =>
      row.id !== "activity" &&
      (row.pillStatus === "not_started" || row.pillStatus === "needs_attention"),
  );
  for (const row of nonActivityReadinessBlockers) {
    blockers.push(`Launch readiness blocker: ${row.label}.`);
  }

  // Suppression sync status — the getting-started "suppression" item
  // only checks whether a sheet id is attached, not whether it's synced.
  // The readiness row captures the sync state, so the block above covers
  // the unsynced case; we add a targeted warning when we can tell the
  // difference.
  const suppressionRow = input.readinessRows.find((row) => row.id === "suppression");
  if (
    suppressionRow?.pillStatus === "needs_attention" &&
    input.mode === "CONTROLLED_INTERNAL"
  ) {
    warnings.push("Suppression sheet is attached but not yet synced.");
  }

  // One-click unsubscribe — blocker for LIVE_PROSPECT, warning for
  // CONTROLLED_INTERNAL until a future PR wires it up.
  if (!input.oneClickUnsubscribeReady) {
    if (input.mode === "LIVE_PROSPECT") {
      blockers.push(
        "One-click unsubscribe is not wired up — required for live prospect outreach.",
      );
    } else {
      warnings.push(
        "One-click unsubscribe is not wired up yet. Acceptable for controlled internal pilots only.",
      );
    }
  }

  const activityRow = input.readinessRows.find((r) => r.id === "activity");
  if (activityRow?.pillStatus === "not_started") {
    warnings.push("No outreach activity yet — expected before the first live send.");
  }

  const checklist: LaunchApprovalChecklistItem[] = [
    {
      id: "brief",
      label: "Business brief complete",
      ok: briefDone,
      detail: briefDone ? "All required brief fields completed" : "Open Brief to complete",
    },
    {
      id: "mailbox",
      label: "Sending mailbox connected",
      ok: mailboxesDone,
      detail: mailboxesDone
        ? "At least one outreach mailbox is connected"
        : "Connect a Microsoft 365 or Google Workspace mailbox",
    },
    {
      id: "suppression",
      label: "Suppression configured",
      ok: suppressionDone,
      detail: suppressionDone
        ? "Suppression sheet attached"
        : "Attach the client's suppression Google Sheet",
    },
    {
      id: "contacts",
      label: "Contacts loaded",
      ok: contactsDone,
      detail: contactsDone
        ? "Contacts present for outreach"
        : "Import contacts into an email list",
    },
    {
      id: "template",
      label: "Introduction ready",
      ok: input.hasProductionLaunchableSequence,
      detail: input.hasProductionLaunchableSequence
        ? "Introduction step passes the production launch rail"
        : "Configure an introduction in Outreach; APPROVED template status is not required",
    },
    {
      id: "sequence",
      label: "Launchable sequence",
      ok: input.hasProductionLaunchableSequence,
      detail: input.hasProductionLaunchableSequence
        ? "At least one non-archived sequence passes the same checks as the Outreach launch rail"
        : "Add a non-archived sequence with a valid intro step; draft/ready are allowed",
    },
    {
      id: "enrollment",
      label: "Sequence enrollments",
      ok: enrollmentsDone && input.enrolledContactsCount >= 1,
      detail: `${String(input.enrolledContactsCount)} enrolled contact(s)`,
    },
    {
      id: "sender_signature",
      label: "Sender signature",
      ok: input.hasSenderSignature,
      detail: input.hasSenderSignature
        ? "At least one connected mailbox has a signature"
        : "Add a signature in Mailboxes for a connected sending mailbox",
    },
    {
      id: "launch_readiness",
      label: "Launch readiness clear",
      ok: nonActivityReadinessBlockers.length === 0,
      detail:
        nonActivityReadinessBlockers.length === 0
          ? "No hard module blockers (Activity is informational pre-first send)"
          : `${String(nonActivityReadinessBlockers.length)} module(s) need attention`,
    },
    {
      id: "one_click_unsubscribe",
      label: "One-click unsubscribe ready",
      ok: input.oneClickUnsubscribeReady,
      detail: input.oneClickUnsubscribeReady
        ? "Unsubscribe header wired end-to-end"
        : "Not wired yet — warning for CONTROLLED_INTERNAL, blocker for LIVE_PROSPECT",
    },
  ];

  return {
    canApprove: blockers.length === 0,
    blockers,
    warnings,
    checklist,
  };
}

/**
 * Normalize the operator-typed confirmation phrase and compare it
 * against {@link LAUNCH_APPROVAL_CONFIRMATION_PHRASE}. The phrase is
 * trimmed before comparison but case-sensitive — operators must type
 * the exact "APPROVE LAUNCH" string, which matches the pattern used by
 * the controlled-pilot and sequence introduction confirmations.
 */
export function isLaunchApprovalConfirmationValid(input: string): boolean {
  return input.trim() === LAUNCH_APPROVAL_CONFIRMATION_PHRASE;
}

/**
 * PR K — Send-gating helper, intentionally not wired into the send
 * path in this PR. Call sites can adopt this predicate in a follow-up
 * PR when we flip sequence intro / step sends to require ACTIVE
 * clients. Kept here so the policy lives next to the approval helper.
 */
export function clientMustBeLaunchApprovedForRealProspectSend(client: {
  status: ClientLifecycleStatus | string;
}): boolean {
  return String(client.status) === "ONBOARDING";
}
