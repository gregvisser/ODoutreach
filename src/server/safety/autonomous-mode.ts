/**
 * Resolving the autonomous relay's state from the environment.
 *
 * The DECISION lives in `@/lib/safety/autonomous-actor-guard`, which is pure
 * and takes everything as arguments. This module is the only place that reads
 * the environment, so the rule stays testable and the env stays in one place.
 *
 * ## The two variables
 *
 * `AUTONOMOUS_RELAY_ACTIVE` — set while the relay is running. Absent means the
 * relay is not running and the guard is inert. That default is deliberate: a
 * gate that switched itself on whenever a variable went missing would become a
 * second, invisible reason production stopped sending, which is an outage
 * wearing a safety jacket.
 *
 * The fail-closed link is made on the other side instead — `relay-watch.ps1`
 * refuses to run a cycle unless the deployed app reports the gate is live. The
 * dangerous state is not "gate off while nobody is running"; it is "agent
 * running while the gate is off", and that is the state the watcher forbids.
 *
 * `AUTONOMOUS_SEND_ALLOWLIST` — comma-separated client slugs. Once the relay is
 * active, an empty or unparseable value refuses EVERYTHING. It is never read as
 * "no restriction".
 */
import type { AutonomousRelayState } from "@/lib/safety/autonomous-actor-guard";

/**
 * The client Greg nominated as the only one an agent may send for or delete
 * within. Used when `AUTONOMOUS_SEND_ALLOWLIST` is not set at all.
 *
 * Note it is `bidlowai`, not `bidlow` — the guard matches slugs exactly, so the
 * near-miss would refuse every send rather than allow a wrong one. That is the
 * correct direction to be wrong in, but it is worth not being wrong at all.
 */
export const DEFAULT_AUTONOMOUS_ALLOWLIST = ["bidlowai"] as const;

/**
 * The environment, as this module needs it.
 *
 * Deliberately looser than `NodeJS.ProcessEnv`, which requires `NODE_ENV` and
 * would force every test to invent a whole environment to set one variable.
 * Only two keys are ever read: `AUTONOMOUS_RELAY_ACTIVE` and
 * `AUTONOMOUS_SEND_ALLOWLIST`.
 */
export type AutonomousModeEnv = Record<string, string | undefined>;

function isTruthy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Read the relay's current state from the environment. */
export function resolveAutonomousRelayState(
  env: AutonomousModeEnv = process.env,
): AutonomousRelayState {
  const active = isTruthy(env.AUTONOMOUS_RELAY_ACTIVE);
  if (!active) {
    return { active: false, allowlist: [] };
  }

  const raw = env.AUTONOMOUS_SEND_ALLOWLIST;
  if (raw === undefined) {
    return { active: true, allowlist: [...DEFAULT_AUTONOMOUS_ALLOWLIST] };
  }

  // An explicitly-set-but-empty value is a MISCONFIGURATION, not permission.
  // It resolves to an empty list, and the guard refuses everything.
  const allowlist = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  return { active: true, allowlist };
}

/**
 * Is the relay running at all?
 *
 * Callers use this to skip the extra database read that resolving a client slug
 * costs, so the guard is genuinely free during ordinary operation.
 */
export function autonomousRelayIsActive(env: AutonomousModeEnv = process.env): boolean {
  return isTruthy(env.AUTONOMOUS_RELAY_ACTIVE);
}
