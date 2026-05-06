import { describe, expect, it } from "vitest";

import {
  ROCKETREACH_IMPORT_CONFIRMATION_PHRASE,
  isRocketReachImportConfirmationValid,
} from "./rocketreach-import-safety";

describe("RocketReach import safety", () => {
  it("requires the exact credit-spend confirmation phrase", () => {
    expect(ROCKETREACH_IMPORT_CONFIRMATION_PHRASE).toBe("SEARCH ROCKETREACH");
    expect(isRocketReachImportConfirmationValid("SEARCH ROCKETREACH")).toBe(true);
    expect(isRocketReachImportConfirmationValid(" search rocketreach ")).toBe(false);
    expect(isRocketReachImportConfirmationValid("IMPORT ROCKETREACH")).toBe(false);
  });
});
