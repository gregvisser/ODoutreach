import { describe, expect, it } from "vitest";

import { mailboxEmailsAlign } from "./mailbox-oauth-callback-shared";

describe("mailboxEmailsAlign", () => {
  it("matches case-insensitively", () => {
    expect(mailboxEmailsAlign("a@b.co", "A@B.CO")).toBe(true);
  });

  it("rejects different mailboxes", () => {
    expect(mailboxEmailsAlign("a@b.co", "x@b.co")).toBe(false);
  });
});
