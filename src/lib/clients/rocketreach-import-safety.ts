export const ROCKETREACH_IMPORT_CONFIRMATION_PHRASE = "SEARCH ROCKETREACH";

export function isRocketReachImportConfirmationValid(value: string): boolean {
  return value.trim() === ROCKETREACH_IMPORT_CONFIRMATION_PHRASE;
}

/** Typed by the staff member who turns automatic list top-up on. */
export const ROCKETREACH_TOP_UP_ENABLE_PHRASE = "ENABLE LIST TOP-UP";

/** Typed by the staff member who turns automatic list top-up off. */
export const ROCKETREACH_TOP_UP_DISABLE_PHRASE = "DISABLE LIST TOP-UP";

export function isRocketReachTopUpConfirmationValid(enabled: boolean, value: string): boolean {
  const expected = enabled ? ROCKETREACH_TOP_UP_ENABLE_PHRASE : ROCKETREACH_TOP_UP_DISABLE_PHRASE;
  return value.trim() === expected;
}

export const ROCKETREACH_CREDIT_WARNING =
  "RocketReach searches and lookups may consume RocketReach credits. No contacts are saved until you type the confirmation phrase and submit the import form.";
