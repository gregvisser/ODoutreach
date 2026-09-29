import { describe, expect, it } from "vitest";

import {
  ROCKETREACH_IMPORT_CONFIRMATION_PHRASE,
  ROCKETREACH_TOP_UP_DISABLE_PHRASE,
  ROCKETREACH_TOP_UP_ENABLE_PHRASE,
  isRocketReachImportConfirmationValid,
  isRocketReachTopUpConfirmationValid,
} from "./rocketreach-import-safety";

describe("RocketReach import safety", () => {
  it("requires the exact credit-spend confirmation phrase", () => {
    expect(ROCKETREACH_IMPORT_CONFIRMATION_PHRASE).toBe("SEARCH ROCKETREACH");
    expect(isRocketReachImportConfirmationValid("SEARCH ROCKETREACH")).toBe(true);
    expect(isRocketReachImportConfirmationValid(" search rocketreach ")).toBe(false);
    expect(isRocketReachImportConfirmationValid("IMPORT ROCKETREACH")).toBe(false);
  });

  it("uses a different phrase to switch automatic list top-up on or off", () => {
    expect(ROCKETREACH_TOP_UP_ENABLE_PHRASE).toBe("ENABLE LIST TOP-UP");
    expect(ROCKETREACH_TOP_UP_DISABLE_PHRASE).toBe("DISABLE LIST TOP-UP");
    expect(isRocketReachTopUpConfirmationValid(true, "ENABLE LIST TOP-UP")).toBe(true);
    expect(isRocketReachTopUpConfirmationValid(false, "DISABLE LIST TOP-UP")).toBe(true);
    expect(isRocketReachTopUpConfirmationValid(true, "DISABLE LIST TOP-UP")).toBe(false);
    expect(isRocketReachTopUpConfirmationValid(true, "enable list top-up")).toBe(false);
  });
});
