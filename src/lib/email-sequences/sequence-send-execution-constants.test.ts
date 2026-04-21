import { describe, expect, it } from "vitest";

import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";
import {
  getSequenceStepSendConfirmationPhrase,
  getSequenceStepSendMetadataKind,
  getSequenceStepSendReservationPrefix,
  isSequenceIntroConfirmationAccepted,
  isSequenceStepSendConfirmationAccepted,
  normaliseSequenceIntroConfirmation,
  normaliseSequenceStepSendConfirmation,
  SEQUENCE_FOLLOWUP_SEND_METADATA_KIND,
  SEQUENCE_INTRO_RESERVATION_KEY_PREFIX,
  SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE,
  SEQUENCE_INTRO_SEND_METADATA_KIND,
  SEQUENCE_STEP_SEND_CONFIRMATION_PHRASES,
} from "./sequence-send-execution-constants";

/**
 * Hotfix after D4e.2 — operators reported that "SEND INTRODUCTION " (a
 * trailing space) or " SEND INTRODUCTION" (leading space) was being
 * rejected even though the phrase text was correct. These tests pin
 * the whitespace-tolerant, case-sensitive behavior we want.
 *
 * PR D4e.3 — the same whitespace rule generalises to follow-up phrases
 * `SEND FOLLOW UP 1..5`, still case-sensitive and WITHOUT collapsing
 * internal whitespace.
 */
describe("normaliseSequenceStepSendConfirmation", () => {
  it("returns the trimmed string for typical operator input", () => {
    expect(normaliseSequenceStepSendConfirmation("SEND INTRODUCTION")).toBe(
      "SEND INTRODUCTION",
    );
    expect(normaliseSequenceStepSendConfirmation(" SEND INTRODUCTION")).toBe(
      "SEND INTRODUCTION",
    );
    expect(normaliseSequenceStepSendConfirmation("SEND INTRODUCTION ")).toBe(
      "SEND INTRODUCTION",
    );
    expect(
      normaliseSequenceStepSendConfirmation("  SEND INTRODUCTION\n"),
    ).toBe("SEND INTRODUCTION");
    expect(
      normaliseSequenceStepSendConfirmation("\tSEND FOLLOW UP 1\t"),
    ).toBe("SEND FOLLOW UP 1");
    expect(
      normaliseSequenceStepSendConfirmation("\r\nSEND FOLLOW UP 5\r\n"),
    ).toBe("SEND FOLLOW UP 5");
  });

  it("does not collapse internal whitespace or change case", () => {
    expect(normaliseSequenceStepSendConfirmation(" send introduction ")).toBe(
      "send introduction",
    );
    expect(normaliseSequenceStepSendConfirmation("SEND  INTRODUCTION")).toBe(
      "SEND  INTRODUCTION",
    );
    expect(normaliseSequenceStepSendConfirmation("SEND  FOLLOW UP 1")).toBe(
      "SEND  FOLLOW UP 1",
    );
    expect(normaliseSequenceStepSendConfirmation("SEND FOLLOW  UP 1")).toBe(
      "SEND FOLLOW  UP 1",
    );
  });

  it("normalises non-string input to the empty string (fail-closed)", () => {
    expect(normaliseSequenceStepSendConfirmation(undefined)).toBe("");
    expect(normaliseSequenceStepSendConfirmation(null)).toBe("");
    expect(normaliseSequenceStepSendConfirmation(42)).toBe("");
    expect(normaliseSequenceStepSendConfirmation({})).toBe("");
    expect(normaliseSequenceStepSendConfirmation([])).toBe("");
  });
});

describe("getSequenceStepSendConfirmationPhrase", () => {
  it("returns the exact per-category phrase", () => {
    expect(getSequenceStepSendConfirmationPhrase("INTRODUCTION")).toBe(
      "SEND INTRODUCTION",
    );
    expect(getSequenceStepSendConfirmationPhrase("FOLLOW_UP_1")).toBe(
      "SEND FOLLOW UP 1",
    );
    expect(getSequenceStepSendConfirmationPhrase("FOLLOW_UP_2")).toBe(
      "SEND FOLLOW UP 2",
    );
    expect(getSequenceStepSendConfirmationPhrase("FOLLOW_UP_3")).toBe(
      "SEND FOLLOW UP 3",
    );
    expect(getSequenceStepSendConfirmationPhrase("FOLLOW_UP_4")).toBe(
      "SEND FOLLOW UP 4",
    );
    expect(getSequenceStepSendConfirmationPhrase("FOLLOW_UP_5")).toBe(
      "SEND FOLLOW UP 5",
    );
  });

  it("has a phrase for every ClientEmailTemplateCategory", () => {
    const categories: ClientEmailTemplateCategory[] = [
      "INTRODUCTION",
      "FOLLOW_UP_1",
      "FOLLOW_UP_2",
      "FOLLOW_UP_3",
      "FOLLOW_UP_4",
      "FOLLOW_UP_5",
    ];
    for (const c of categories) {
      const phrase = SEQUENCE_STEP_SEND_CONFIRMATION_PHRASES[c];
      expect(phrase.trim()).toBe(phrase);
      expect(phrase.length).toBeGreaterThan(0);
    }
  });

  it("all phrases are unique", () => {
    const phrases = Object.values(SEQUENCE_STEP_SEND_CONFIRMATION_PHRASES);
    expect(new Set(phrases).size).toBe(phrases.length);
  });
});

describe("isSequenceStepSendConfirmationAccepted", () => {
  it("accepts the exact phrase for every category", () => {
    for (const category of Object.keys(
      SEQUENCE_STEP_SEND_CONFIRMATION_PHRASES,
    ) as ClientEmailTemplateCategory[]) {
      expect(
        isSequenceStepSendConfirmationAccepted(
          category,
          getSequenceStepSendConfirmationPhrase(category),
        ),
      ).toBe(true);
    }
  });

  it("accepts phrases with surrounding whitespace per category", () => {
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        " SEND FOLLOW UP 1",
      ),
    ).toBe(true);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        "SEND FOLLOW UP 1 ",
      ),
    ).toBe(true);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_2",
        "\tSEND FOLLOW UP 2\n",
      ),
    ).toBe(true);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_5",
        "\r\nSEND FOLLOW UP 5\r\n",
      ),
    ).toBe(true);
  });

  it("remains case-sensitive for follow-ups", () => {
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        "send follow up 1",
      ),
    ).toBe(false);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        "Send Follow Up 1",
      ),
    ).toBe(false);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        "send follow up 1 ",
      ),
    ).toBe(false);
  });

  it("rejects a confirmation phrase for the wrong category", () => {
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        "SEND INTRODUCTION",
      ),
    ).toBe(false);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_2",
        "SEND FOLLOW UP 1",
      ),
    ).toBe(false);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "INTRODUCTION",
        "SEND FOLLOW UP 1",
      ),
    ).toBe(false);
  });

  it("rejects partial or altered phrases", () => {
    expect(
      isSequenceStepSendConfirmationAccepted("FOLLOW_UP_1", "SEND FOLLOW UP"),
    ).toBe(false);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        "SEND FOLLOW UP 1 NOW",
      ),
    ).toBe(false);
    // Internal whitespace MUST NOT be collapsed.
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        "SEND  FOLLOW UP 1",
      ),
    ).toBe(false);
    expect(
      isSequenceStepSendConfirmationAccepted(
        "FOLLOW_UP_1",
        "SEND FOLLOW  UP 1",
      ),
    ).toBe(false);
  });

  it("rejects empty and non-string inputs for every category", () => {
    for (const category of Object.keys(
      SEQUENCE_STEP_SEND_CONFIRMATION_PHRASES,
    ) as ClientEmailTemplateCategory[]) {
      expect(isSequenceStepSendConfirmationAccepted(category, "")).toBe(false);
      expect(isSequenceStepSendConfirmationAccepted(category, "   ")).toBe(
        false,
      );
      expect(
        isSequenceStepSendConfirmationAccepted(category, undefined),
      ).toBe(false);
      expect(isSequenceStepSendConfirmationAccepted(category, null)).toBe(
        false,
      );
      expect(isSequenceStepSendConfirmationAccepted(category, 0)).toBe(false);
      expect(isSequenceStepSendConfirmationAccepted(category, false)).toBe(
        false,
      );
    }
  });
});

describe("isSequenceIntroConfirmationAccepted (back-compat alias)", () => {
  it("still accepts the canonical intro phrase", () => {
    expect(
      isSequenceIntroConfirmationAccepted(
        SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE,
      ),
    ).toBe(true);
    expect(isSequenceIntroConfirmationAccepted(" SEND INTRODUCTION ")).toBe(
      true,
    );
    expect(isSequenceIntroConfirmationAccepted("send introduction")).toBe(
      false,
    );
    expect(isSequenceIntroConfirmationAccepted("SEND FOLLOW UP 1")).toBe(
      false,
    );
  });

  it("exposes the same trim-first behaviour via the deprecated alias", () => {
    expect(normaliseSequenceIntroConfirmation("\tSEND INTRODUCTION\t")).toBe(
      "SEND INTRODUCTION",
    );
    expect(normaliseSequenceIntroConfirmation(null)).toBe("");
  });
});

describe("getSequenceStepSendMetadataKind", () => {
  it("uses the legacy intro kind for INTRODUCTION", () => {
    expect(getSequenceStepSendMetadataKind("INTRODUCTION")).toBe(
      SEQUENCE_INTRO_SEND_METADATA_KIND,
    );
    expect(SEQUENCE_INTRO_SEND_METADATA_KIND).toBe("sequenceIntroductionSend");
  });

  it("uses the follow-up kind for every FOLLOW_UP_N category", () => {
    for (const c of [
      "FOLLOW_UP_1",
      "FOLLOW_UP_2",
      "FOLLOW_UP_3",
      "FOLLOW_UP_4",
      "FOLLOW_UP_5",
    ] as const) {
      expect(getSequenceStepSendMetadataKind(c)).toBe(
        SEQUENCE_FOLLOWUP_SEND_METADATA_KIND,
      );
    }
    expect(SEQUENCE_FOLLOWUP_SEND_METADATA_KIND).toBe("sequenceFollowUpSend");
  });
});

describe("getSequenceStepSendReservationPrefix", () => {
  it("keeps the legacy seqIntro prefix for INTRODUCTION", () => {
    expect(getSequenceStepSendReservationPrefix("INTRODUCTION")).toBe(
      SEQUENCE_INTRO_RESERVATION_KEY_PREFIX,
    );
    expect(SEQUENCE_INTRO_RESERVATION_KEY_PREFIX).toBe("seqIntro");
  });

  it("uses seqFollow${N} for follow-ups", () => {
    expect(getSequenceStepSendReservationPrefix("FOLLOW_UP_1")).toBe(
      "seqFollow1",
    );
    expect(getSequenceStepSendReservationPrefix("FOLLOW_UP_2")).toBe(
      "seqFollow2",
    );
    expect(getSequenceStepSendReservationPrefix("FOLLOW_UP_3")).toBe(
      "seqFollow3",
    );
    expect(getSequenceStepSendReservationPrefix("FOLLOW_UP_4")).toBe(
      "seqFollow4",
    );
    expect(getSequenceStepSendReservationPrefix("FOLLOW_UP_5")).toBe(
      "seqFollow5",
    );
  });

  it("prefixes are unique across categories", () => {
    const categories: ClientEmailTemplateCategory[] = [
      "INTRODUCTION",
      "FOLLOW_UP_1",
      "FOLLOW_UP_2",
      "FOLLOW_UP_3",
      "FOLLOW_UP_4",
      "FOLLOW_UP_5",
    ];
    const prefixes = categories.map(getSequenceStepSendReservationPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
