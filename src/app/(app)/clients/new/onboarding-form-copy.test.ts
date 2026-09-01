import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const onboardingFormPath = join(
  process.cwd(),
  "src/app/(app)/clients/new/onboarding-form.tsx",
);

// Row 153 (raised by row 135/cycle195 finding 4): the "After create" box
// promised Brief -> Mailboxes -> Sources -> Suppression -> Contacts ->
// Templates -> Sequences -> Activity, which contradicts the real 8-step
// checklist the client actually sees immediately after creation
// (src/lib/clients/getting-started-view-model.ts) — Brief, Mailboxes,
// Suppression, Contacts, Templates, Sequences, Enrollments, Launch, with no
// Sources step and no Activity step at all.
describe("New-client onboarding form copy (row 153)", () => {
  it("states the real 8-step getting-started order, not the old contradicted one", () => {
    const src = readFileSync(onboardingFormPath, "utf8");
    const normalized = src.replace(/\s+/g, " ");

    expect(normalized).not.toContain(
      "Brief → Mailboxes → Sources → Suppression → Contacts → Templates → Sequences → Activity",
    );

    expect(normalized).toContain(
      "Brief → Mailboxes → Suppression → Contacts → Templates → Sequences → Enrollments → Launch",
    );
  });
});
