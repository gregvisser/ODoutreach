import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("reply detail wording", () => {
  it("calls the person the sender on the reply and the claim notice", () => {
    const detail = readFileSync(
      join(process.cwd(), "src/components/activity/client-linked-reply-detail.tsx"),
      "utf8",
    );
    expect(detail).toContain("What the sender wrote.");
    expect(detail).toContain("Status of the sender in the linked sequence.");
    expect(detail).not.toContain("the prospect");

    const claim = readFileSync(
      join(process.cwd(), "src/components/activity/reply-claim-notice.tsx"),
      "utf8",
    );
    expect(claim).toContain("this sender");
    expect(claim).not.toContain("this prospect");
  });
});
