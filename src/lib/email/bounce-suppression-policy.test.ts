import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  classifyBounceHardness,
  isBounceSuppressionEnabled,
} from "./bounce-suppression-policy";

describe("classifyBounceHardness", () => {
  it("classifies Resend/SES 'Permanent' as hard", () => {
    expect(classifyBounceHardness({ bounceType: "Permanent" })).toBe("hard");
  });

  it("classifies Resend/SES 'Transient' as soft", () => {
    expect(classifyBounceHardness({ bounceType: "Transient" })).toBe("soft");
  });

  it("classifies 'Undetermined' as unknown (never suppresses)", () => {
    expect(classifyBounceHardness({ bounceType: "Undetermined" })).toBe(
      "unknown",
    );
  });

  it("returns unknown when there is no signal at all", () => {
    expect(classifyBounceHardness({})).toBe("unknown");
    expect(
      classifyBounceHardness({ bounceType: null, bounceCategory: null }),
    ).toBe("unknown");
    expect(
      classifyBounceHardness({ bounceType: "  ", bounceCategory: "" }),
    ).toBe("unknown");
  });

  it("is case-insensitive and substring-tolerant on free-text messages", () => {
    expect(
      classifyBounceHardness({ bounceCategory: "Permanent failure: user unknown" }),
    ).toBe("hard");
    expect(
      classifyBounceHardness({ bounceCategory: "TEMPORARY mailbox full" }),
    ).toBe("soft");
  });

  it("recognises explicit hard/soft words", () => {
    expect(classifyBounceHardness({ bounceCategory: "hard bounce" })).toBe(
      "hard",
    );
    expect(classifyBounceHardness({ bounceCategory: "soft bounce" })).toBe(
      "soft",
    );
  });

  it("prefers an explicit type but still reads the category fallback", () => {
    // type present → classify on it
    expect(
      classifyBounceHardness({
        bounceType: "Permanent",
        bounceCategory: "some message",
      }),
    ).toBe("hard");
    // type absent → category carries the signal
    expect(
      classifyBounceHardness({
        bounceType: null,
        bounceCategory: "Transient",
      }),
    ).toBe("soft");
  });

  it("does not treat a non-permanent message that merely mentions delivery as hard", () => {
    expect(
      classifyBounceHardness({ bounceCategory: "Recipient address rejected" }),
    ).toBe("unknown");
  });
});

describe("isBounceSuppressionEnabled", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.BOUNCE_SUPPRESSION_ENABLED;
    delete process.env.BOUNCE_SUPPRESSION_ENABLED;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.BOUNCE_SUPPRESSION_ENABLED;
    else process.env.BOUNCE_SUPPRESSION_ENABLED = saved;
  });

  it("defaults to OFF when unset", () => {
    expect(isBounceSuppressionEnabled()).toBe(false);
  });

  it("is OFF for falsey / unrecognised values", () => {
    for (const v of ["", "false", "0", "off", "no", "nope", "  "]) {
      process.env.BOUNCE_SUPPRESSION_ENABLED = v;
      expect(isBounceSuppressionEnabled()).toBe(false);
    }
  });

  it("is ON for the accepted truthy values (case-insensitive)", () => {
    for (const v of ["true", "TRUE", "1", "on", "ON", "yes", "Yes", " true "]) {
      process.env.BOUNCE_SUPPRESSION_ENABLED = v;
      expect(isBounceSuppressionEnabled()).toBe(true);
    }
  });
});
