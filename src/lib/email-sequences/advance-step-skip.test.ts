import { describe, expect, it } from "vitest";

import { EMPTY_STEP_ADVANCE_CODE, isEmptyAdvanceStep } from "./advance-step-skip";

describe("isEmptyAdvanceStep", () => {
  it("treats an already-complete or empty step as a skip", () => {
    expect(EMPTY_STEP_ADVANCE_CODE).toBe("NO_READY_ROWS");
    expect(isEmptyAdvanceStep("NO_READY_ROWS")).toBe(true);
  });

  it("keeps a real dispatch failure as a failure", () => {
    expect(isEmptyAdvanceStep("NO_MAILBOX_POOL")).toBe(false);
    expect(isEmptyAdvanceStep(undefined)).toBe(false);
    expect(isEmptyAdvanceStep("")).toBe(false);
  });
});
