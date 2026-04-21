import { describe, expect, it } from "vitest";

import {
  INBOUND_REPLY_BODY_MAX,
  validateReplyDraft,
} from "./inbound-reply-validation";

describe("validateReplyDraft", () => {
  it("accepts a non-empty reply", () => {
    const r = validateReplyDraft({
      subject: "Re: Hello",
      bodyText: "  Thanks for reaching out!  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trimmedBody).toBe("Thanks for reaching out!");
  });

  it("rejects empty body", () => {
    const r = validateReplyDraft({ subject: "Re: X", bodyText: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("BODY_REQUIRED");
  });

  it("rejects empty subject", () => {
    const r = validateReplyDraft({ subject: "   ", bodyText: "ok" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("SUBJECT_MISSING");
  });

  it("rejects oversize body", () => {
    const r = validateReplyDraft({
      subject: "Re: Hi",
      bodyText: "x".repeat(INBOUND_REPLY_BODY_MAX + 1),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("BODY_TOO_LONG");
  });
});
