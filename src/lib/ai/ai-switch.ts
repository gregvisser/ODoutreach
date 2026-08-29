/**
 * The one switch that turns the phase-2 AI features off.
 *
 * The spec is explicit about why this exists, and it is commercial rather than
 * technical: the features ship ON and visible so the owner sees their value,
 * and Greg's leverage is that they CAN be taken away. That leverage is only
 * real if switching them off is a single, instant, reversible action — so it is
 * one environment variable in one place, not a flag per feature scattered
 * through the code.
 *
 * DEFAULTS ON. An unset variable means the features run, which is the opposite
 * of `decideClientOpenTracking` and deliberately so: tracking can damage a
 * client's sending domain, whereas classifying a reply cannot send anything,
 * cannot change what is sent, and cannot reach a recipient. The only thing at
 * risk here is money, and that is metered.
 *
 * Matches `isOpenTrackingPixelEnabled`'s tolerant reading of "off" on purpose:
 * Azure's app-settings editor offers no validation, and a switch that ignores
 * "OFF " with a trailing space is a switch that did not work when it was needed.
 */

/** Values an operator may reasonably type into the Azure portal to mean "off". */
const OFF_VALUES = new Set(["off", "false", "0", "no", "disabled"]);

/**
 * Whether the phase-2 AI features may run at all.
 *
 * Set `AI_FEATURES=off` in Azure app settings to stop every AI call at once.
 * Refusals are still METERED (as REFUSED, costing nothing), so "we switched it
 * off" and "it quietly stopped working" stay distinguishable on the ledger —
 * which is the failure this project has repeatedly shipped.
 */
export function areAiFeaturesEnabled(): boolean {
  const raw = process.env.AI_FEATURES;
  if (raw === undefined) return true;
  return !OFF_VALUES.has(raw.trim().toLowerCase());
}
