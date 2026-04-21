import { describe, expect, it } from "vitest";

import {
  isSequenceIntroConfirmationAccepted,
  normaliseSequenceIntroConfirmation,
  SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE,
} from "./sequence-send-execution-constants";

/**
 * Hotfix after D4e.2 — operators reported that "SEND INTRODUCTION " (a
 * trailing space) or " SEND INTRODUCTION" (leading space) was being
 * rejected even though the phrase text was correct. These tests pin
 * the whitespace-tolerant, case-sensitive behavior we want.
 */
describe("normaliseSequenceIntroConfirmation", () => {
  it("returns the trimmed string for typical operator input", () => {
    expect(normaliseSequenceIntroConfirmation("SEND INTRODUCTION")).toBe(
      "SEND INTRODUCTION",
    );
    expect(normaliseSequenceIntroConfirmation(" SEND INTRODUCTION")).toBe(
      "SEND INTRODUCTION",
    );
    expect(normaliseSequenceIntroConfirmation("SEND INTRODUCTION ")).toBe(
      "SEND INTRODUCTION",
    );
    expect(normaliseSequenceIntroConfirmation("  SEND INTRODUCTION\n")).toBe(
      "SEND INTRODUCTION",
    );
    expect(normaliseSequenceIntroConfirmation("\tSEND INTRODUCTION\t")).toBe(
      "SEND INTRODUCTION",
    );
  });

  it("does not collapse internal whitespace or change case", () => {
    expect(
      normaliseSequenceIntroConfirmation(" send introduction "),
    ).toBe("send introduction");
    expect(
      normaliseSequenceIntroConfirmation("SEND  INTRODUCTION"),
    ).toBe("SEND  INTRODUCTION");
  });

  it("normalises non-string input to the empty string (fail-closed)", () => {
    expect(normaliseSequenceIntroConfirmation(undefined)).toBe("");
    expect(normaliseSequenceIntroConfirmation(null)).toBe("");
    expect(normaliseSequenceIntroConfirmation(42)).toBe("");
    expect(normaliseSequenceIntroConfirmation({})).toBe("");
    expect(normaliseSequenceIntroConfirmation([])).toBe("");
  });
});

describe("isSequenceIntroConfirmationAccepted", () => {
  it("accepts the exact phrase", () => {
    expect(
      isSequenceIntroConfirmationAccepted(
        SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE,
      ),
    ).toBe(true);
  });

  it("accepts the phrase with surrounding whitespace", () => {
    expect(isSequenceIntroConfirmationAccepted(" SEND INTRODUCTION")).toBe(
      true,
    );
    expect(isSequenceIntroConfirmationAccepted("SEND INTRODUCTION ")).toBe(
      true,
    );
    expect(isSequenceIntroConfirmationAccepted("  SEND INTRODUCTION  ")).toBe(
      true,
    );
    // Trailing newline, which is natural when an input autofills or a
    // multi-line textarea is used on some browsers.
    expect(isSequenceIntroConfirmationAccepted("SEND INTRODUCTION\n")).toBe(
      true,
    );
    expect(
      isSequenceIntroConfirmationAccepted("\r\nSEND INTRODUCTION\r\n"),
    ).toBe(true);
    expect(isSequenceIntroConfirmationAccepted("\tSEND INTRODUCTION\t")).toBe(
      true,
    );
  });

  it("remains case-sensitive", () => {
    expect(isSequenceIntroConfirmationAccepted("send introduction")).toBe(
      false,
    );
    expect(isSequenceIntroConfirmationAccepted("Send Introduction")).toBe(
      false,
    );
    expect(isSequenceIntroConfirmationAccepted(" send introduction ")).toBe(
      false,
    );
  });

  it("rejects partial or altered phrases", () => {
    expect(isSequenceIntroConfirmationAccepted("SEND INTRO")).toBe(false);
    expect(isSequenceIntroConfirmationAccepted("SEND INTRODUCTIONS")).toBe(
      false,
    );
    expect(isSequenceIntroConfirmationAccepted("SEND  INTRODUCTION")).toBe(
      false,
    );
    expect(
      isSequenceIntroConfirmationAccepted("SEND INTRODUCTION NOW"),
    ).toBe(false);
  });

  it("rejects empty and non-string inputs", () => {
    expect(isSequenceIntroConfirmationAccepted("")).toBe(false);
    expect(isSequenceIntroConfirmationAccepted("   ")).toBe(false);
    expect(isSequenceIntroConfirmationAccepted(undefined)).toBe(false);
    expect(isSequenceIntroConfirmationAccepted(null)).toBe(false);
    expect(isSequenceIntroConfirmationAccepted(0)).toBe(false);
    expect(isSequenceIntroConfirmationAccepted(false)).toBe(false);
  });
});
