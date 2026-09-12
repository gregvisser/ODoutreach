import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const onboardingFormPath = join(
  process.cwd(),
  "src/app/(app)/clients/new/onboarding-form.tsx",
);

// Setup guidance must name the visible staff menus. Sequence and recipient
// review happen inside Outreach rather than separate sidebar destinations.
describe("New-client onboarding form copy (row 153)", () => {
  it("uses current staff menu names and requires review before launch", () => {
    const src = readFileSync(onboardingFormPath, "utf8");
    const normalized = src.replace(/\s+/g, " ");

    expect(normalized).not.toContain(
      "Brief → Mailboxes → Sources → Suppression → Contacts → Templates → Sequences → Activity",
    );

    expect(normalized).toContain(
      "Brief → Mailboxes → Do-not-contact → Lists → Templates → Outreach",
    );
    expect(normalized).toContain("review your sequence and recipients before choosing to launch");
  });
});
