/**
 * The autonomous-actor safety gate.
 *
 * ## The rule, in Greg's words
 *
 * > "if any emails or deleting gets done, it can only happen on the bidlow
 * >  client in the ODoutreach system. all other clients can be worked on to
 * >  prove the system, but sending and deleting can only happen on bidlow
 * >  customer."
 *
 * This module is that rule as code. It exists because **a rule written only in
 * a markdown file is a rule that gets forgotten by cycle forty**, and because
 * this repository sends real mail from real corporate mailboxes to real people
 * at other companies. A send cannot be recalled.
 *
 * ## What it gates, and what it deliberately does not
 *
 * It gates the **actor**, not the action. An autonomous agent sending for a
 * client that is not allowlisted is refused; Greg or a member of staff doing
 * the same thing from the app is untouched. Gating the action alone would
 * either stop the business working or stop nothing at all.
 *
 * Outside autonomous operation this guard is **completely inert**. That is
 * deliberate: a safety gate that quietly becomes a second, invisible reason
 * production stopped sending is not a safety gate, it is an outage.
 *
 * ## Purity
 *
 * No Prisma, no environment reads, no clock. Everything is passed in, exactly
 * as `evaluateSendGovernance` is written, so the dispatcher, the destructive
 * paths and the tests all reach the same decision from the same inputs.
 * Resolving the environment is `@/server/safety/autonomous-mode`'s job.
 */

/** What the actor is trying to do. Both halves of Greg's rule. */
export type AutonomousGuardedAction = "SEND" | "DESTRUCTIVE";

/**
 * Who is asking.
 *
 * `UNKNOWN` is not a third case with its own behaviour — it is treated exactly
 * as `MACHINE`. Anything that cannot show it is a person is assumed to be one
 * of ours, because the alternative is an unidentified caller inheriting a
 * human's permissions.
 */
export type AutonomousActor = "HUMAN_STAFF" | "MACHINE" | "UNKNOWN";

/** The relay's state, resolved from the environment by the caller. */
export type AutonomousRelayState = {
  /** True while the autonomous relay is running. */
  active: boolean;
  /** Client slugs the relay may send for and delete within. */
  allowlist: readonly string[];
};

export type AutonomousActorGuardInput = {
  action: AutonomousGuardedAction;
  actor: AutonomousActor;
  /** The client this action would affect. */
  clientSlug: string | null | undefined;
  relay: AutonomousRelayState;
};

export type AutonomousGuardRefusalCode =
  | "autonomous_allowlist_missing"
  | "autonomous_client_unidentified"
  | "autonomous_client_not_allowlisted";

export type AutonomousActorGuardDecision =
  | { allowed: true; reason: string }
  | { allowed: false; code: AutonomousGuardRefusalCode; reason: string };

/** A slug is case-insensitive and never carries surrounding space. */
function normaliseSlug(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function describe(action: AutonomousGuardedAction): string {
  return action === "SEND" ? "Sending email" : "Deleting or destroying data";
}

/**
 * Decide whether an autonomous actor may perform this action for this client.
 *
 * **Fails closed at every branch.** Once the relay is active, an action is
 * allowed only when a real client slug matches a real allowlist entry. A
 * missing allowlist, a blank allowlist, an unidentifiable client and an
 * unrecognised actor all REFUSE. There is no path through this function that
 * reaches `allowed: true` by default, by omission, or by an empty value
 * matching another empty value.
 */
export function evaluateAutonomousActorGuard(
  input: AutonomousActorGuardInput,
): AutonomousActorGuardDecision {
  // Not running. The guard must not change ordinary behaviour in any way.
  if (!input.relay.active) {
    return { allowed: true, reason: "The autonomous relay is not running." };
  }

  // A person is a person. This is the clause that keeps the business working
  // while an agent is running alongside it.
  if (input.actor === "HUMAN_STAFF") {
    return {
      allowed: true,
      reason: "Started by a signed-in member of staff, so the relay gate does not apply.",
    };
  }

  // Blank entries are dropped BEFORE the emptiness check, so a misconfigured
  // "AUTONOMOUS_SEND_ALLOWLIST=," cannot become a single empty-named client
  // that an unidentified slug would then match.
  const allowlist = input.relay.allowlist.map(normaliseSlug).filter((s) => s.length > 0);

  if (allowlist.length === 0) {
    return {
      allowed: false,
      code: "autonomous_allowlist_missing",
      reason:
        `${describe(input.action)} is refused: the autonomous relay is running but no ` +
        `client is allowlisted. Nothing may be sent or deleted until one is. This is ` +
        `the gate failing closed, which is correct — it is not a bug to work around.`,
    };
  }

  const slug = normaliseSlug(input.clientSlug);
  if (!slug) {
    return {
      allowed: false,
      code: "autonomous_client_unidentified",
      reason:
        `${describe(input.action)} is refused: the client could not be identified, so it ` +
        `cannot be checked against the allowlist (${allowlist.join(", ")}).`,
    };
  }

  // Exact match only. 'bidlow-old' is a different workspace from 'bidlow', and
  // a substring match here would silently widen the permission.
  if (!allowlist.includes(slug)) {
    return {
      allowed: false,
      code: "autonomous_client_not_allowlisted",
      reason:
        `${describe(input.action)} is refused for "${slug}" while the autonomous relay is ` +
        `running. Only ${allowlist.join(", ")} may be sent for or deleted within. Any other ` +
        `client can still be built on, tested and reported on — nothing leaves the building.`,
    };
  }

  return {
    allowed: true,
    reason: `"${slug}" is on the autonomous relay allowlist.`,
  };
}
