import type {
  SequenceLaunchCheckId,
  SequenceLaunchReadiness,
} from "@/lib/email-sequences/launch-readiness";

/**
 * Launch-readiness blockers that stop ANY send (introduction or follow-up):
 * a connected sending mailbox, a sender signature, daily capacity, and the
 * unsubscribe footer. These are the checks the per-step send snapshot's
 * `disabledReason` does NOT cover, so the Launch button must consult them too —
 * otherwise the button stays enabled while the readiness rail says "not ready"
 * and a launch only fails with a back-end error on click.
 *
 * The sequence/state/template/recipient checks are deliberately excluded here:
 * the send snapshot already gates those, and they're introduction-specific (so
 * they must not disable a follow-up button).
 */
export const INFRA_LAUNCH_BLOCKER_IDS: ReadonlySet<SequenceLaunchCheckId> =
  new Set<SequenceLaunchCheckId>([
    "connected_sending_mailbox",
    "sender_signature_configured",
    "daily_capacity_available",
    "unsubscribe_placeholder_present",
  ]);

/**
 * The human-readable reasons for the infra blockers currently failing, or an
 * empty array when readiness is unknown or all infra checks pass.
 */
export function infraLaunchBlockerReasons(
  readiness: SequenceLaunchReadiness | null | undefined,
): string[] {
  if (!readiness) return [];
  return readiness.checks
    .filter(
      (c) =>
        c.status === "fail" &&
        c.severity === "blocker" &&
        INFRA_LAUNCH_BLOCKER_IDS.has(c.id),
    )
    .map((c) => c.detail || c.label);
}
