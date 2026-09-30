import { describe, expect, it } from "vitest";

import { isUnrecognizedActionFailure } from "./action-failure";

describe("isUnrecognizedActionFailure", () => {
  it("recognises UnrecognizedActionError by name", () => {
    const error = new Error(
      'Server Action "40ecabc" was not found on the server',
    );
    error.name = "UnrecognizedActionError";
    expect(isUnrecognizedActionFailure(error)).toBe(true);
  });

  it("recognises the missing-action message without the class name", () => {
    expect(
      isUnrecognizedActionFailure(
        new Error('Server Action "40ecabc" was not found on the server'),
      ),
    ).toBe(true);
  });

  it("walks error.cause chains", () => {
    const cause = new Error('Server Action "x" was not found on the server');
    const wrapped = new Error("Action failed");
    wrapped.cause = cause;
    expect(isUnrecognizedActionFailure(wrapped)).toBe(true);
  });

  it("ignores unrelated failures", () => {
    expect(isUnrecognizedActionFailure(new Error("Mailbox quota exceeded"))).toBe(
      false,
    );
  });
});
