import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sequenceActions = join(
  root,
  "src/app/(app)/clients/[clientId]/outreach/sequence-actions.ts",
);
const sequencesPanel = join(
  root,
  "src/components/clients/email-sequences/client-email-sequences-panel.tsx",
);
const archiveConfirm = join(
  root,
  "src/components/clients/email-sequences/sequence-archive-confirm-form.tsx",
);

describe("Outreach PR #122 launch-ready flow", () => {
  it("runs automatic preparation after sequence save when an introduction step exists", () => {
    const src = readFileSync(sequenceActions, "utf8");
    expect(src).toContain("autoPrepareSequenceForLaunch");
    expect(src).toContain("createClientEmailSequenceAction");
    expect(src).toContain("updateClientEmailSequenceAction");
  });

  it("does not show Mark ready / Go live / Back to editing in the staff sequences panel", () => {
    const src = readFileSync(sequencesPanel, "utf8");
    expect(src).not.toContain("Mark ready");
    expect(src).not.toContain("Go live");
    expect(src).not.toContain("Back to editing");
  });

  it("offers Delete or archive sequence with a confirm wrapper and preserved contacts copy", () => {
    const panel = readFileSync(sequencesPanel, "utf8");
    const confirm = readFileSync(archiveConfirm, "utf8");
    // PR #140 (G5): button copy explicitly says "Delete or archive" so staff
    // know audit history is kept when a sequence has send history.
    expect(panel).toContain("Delete or archive sequence");
    expect(panel).toContain("Contacts and lists will stay available");
    expect(panel).toContain("ArchiveSequenceConfirmForm");
    expect(confirm).toContain("confirm(");
  });
});
