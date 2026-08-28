/**
 * The per-client autonomous-send switch: machine sending, or human sending.
 *
 * Greg, 2026-08-28: *"yes the machine can send for all customers from now on.
 * there must be a switch or toggle set to make it machine sending or human
 * sending."*
 *
 * Pure. No Prisma, no clock, no environment — the value arrives and a label or
 * a signature line leaves, so the card, the server action and the tests all
 * describe the switch in exactly the same words.
 *
 * ## Three states, and the third one is the point
 *
 * `true` / `false` / **not set**. A plain boolean would collapse "we decided
 * this client sends by hand" into "nobody has looked at this client yet", and
 * those are different facts that deserve different words on screen. Both refuse
 * a machine send; only one of them is a decision anybody made.
 *
 * The DECISION lives in `@/lib/safety/autonomous-actor-guard`. This module only
 * decides what a person reads.
 */

import { formatAttributionTimestamp } from "./client-account-grade";

/** What the switch is set to, as the screen thinks about it. */
export type AutonomousSendSetting = "MACHINE" | "HUMAN";

export const AUTONOMOUS_SEND_SETTINGS = ["MACHINE", "HUMAN"] as const;

const SETTING_LABELS: Record<AutonomousSendSetting, string> = {
  MACHINE: "Machine sending",
  HUMAN: "Human sending",
};

/**
 * Read the stored three-state column as a setting. `null` back means nobody has
 * decided.
 */
export function autonomousSendSetting(
  enabled: boolean | null | undefined,
): AutonomousSendSetting | null {
  if (enabled === true) return "MACHINE";
  if (enabled === false) return "HUMAN";
  return null;
}

/** Never render a raw boolean at a member of staff. */
export function autonomousSendLabel(enabled: boolean | null | undefined): string {
  const setting = autonomousSendSetting(enabled);
  return setting ? SETTING_LABELS[setting] : "Not set";
}

/**
 * One line saying what this setting actually DOES, in the terms the person
 * reading it cares about: who is allowed to put mail in a stranger's inbox.
 */
export function autonomousSendDescription(enabled: boolean | null | undefined): string {
  switch (autonomousSendSetting(enabled)) {
    case "MACHINE":
      return (
        "This client's outreach can be sent by the system on its own, without a member of " +
        "staff pressing send each time. Every other safety check still applies."
      );
    case "HUMAN":
      return (
        "Only a signed-in member of staff can send for this client. The system will not send " +
        "for them on its own."
      );
    default:
      return (
        "Nobody has chosen yet, so the system will not send for this client on its own. Until " +
        "someone chooses, only a signed-in member of staff can send for them."
      );
  }
}

/** Narrow an untrusted form string to a setting. */
export function parseAutonomousSendSetting(
  value: string | null | undefined,
): AutonomousSendSetting | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (AUTONOMOUS_SEND_SETTINGS as readonly string[]).includes(upper)
    ? (upper as AutonomousSendSetting)
    : null;
}

/** The setting as the column stores it. */
export function autonomousSendSettingToColumn(setting: AutonomousSendSetting): boolean {
  return setting === "MACHINE";
}

export function autonomousSendSettingLabel(setting: AutonomousSendSetting): string {
  return SETTING_LABELS[setting];
}

/**
 * The signature line rendered next to the switch.
 *
 * Returns null when nobody has set it — the card says so in its own words
 * rather than rendering a half-empty "Set by —, —".
 */
export function formatAutonomousSendAttribution(input: {
  enabled: boolean | null | undefined;
  setByName: string | null | undefined;
  setAt: Date | null | undefined;
}): string | null {
  const setting = autonomousSendSetting(input.enabled);
  if (!setting || !input.setAt) return null;
  // The staff user may since have been deleted — the FK is ON DELETE SET NULL —
  // so keep the timestamp and say "someone". Losing the fact that it WAS set is
  // worse than losing the name.
  const who = input.setByName?.trim() ? input.setByName.trim() : "a former member of staff";
  return `Set to ${SETTING_LABELS[setting]} by ${who}, ${formatAttributionTimestamp(input.setAt)}`;
}
