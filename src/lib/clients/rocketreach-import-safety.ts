export const ROCKETREACH_IMPORT_CONFIRMATION_PHRASE = "SEARCH ROCKETREACH";

export function isRocketReachImportConfirmationValid(value: string): boolean {
  return value.trim() === ROCKETREACH_IMPORT_CONFIRMATION_PHRASE;
}

export const ROCKETREACH_CREDIT_WARNING =
  "RocketReach searches and lookups may consume RocketReach credits. No contacts are saved until you type the confirmation phrase and submit the import form.";
