import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Automatic related-domain discovery must be REACHABLE, not merely built.
 *
 * Cycle 15 found the seventh instance of this repository's worst defect: a
 * feature that is written, migrated, tested and reporting success, with nothing
 * that ever calls it. `family-discovery-run.ts` and `family-proposals.ts` were
 * complete and had four passing test files, but the only caller was an ops
 * script a human has to remember to run — no screen, no server action, no
 * schedule. The operator's only route was the manual "Company + Their domain"
 * form, which is the exact human-typed step Greg forbade.
 *
 * These assertions are deliberately about WIRING, not logic. The logic already
 * had tests and they all passed while the feature was unreachable, which is
 * precisely why passing logic tests are not evidence that a feature fires.
 */

const root = process.cwd();
const actions = join(root, "src/app/(app)/clients/do-not-contact-actions.ts");
const page = join(root, "src/app/(app)/clients/[clientId]/suppression/page.tsx");
const panel = join(root, "src/components/suppression/family-proposal-panel.tsx");
const route = join(
  root,
  "src/app/api/internal/suppression/discover-families/route.ts",
);
const workflow = join(root, ".github/workflows/discover-domain-families.yml");

describe("related-domain discovery is wired to a caller and a screen", () => {
  it("exposes confirm, reject and run-now server actions", () => {
    const src = readFileSync(actions, "utf8");
    expect(src).toContain("confirmFamilyProposalAction");
    expect(src).toContain("rejectFamilyProposalAction");
    expect(src).toContain("discoverFamilyProposalsAction");
    // The actions must delegate to the reviewed modules rather than
    // reimplementing the decision, or the tombstone guarantee is bypassed.
    expect(src).toContain("confirmFamilyProposal");
    expect(src).toContain("rejectFamilyProposal");
    expect(src).toContain("planClientFamilyProposals");
    expect(src).toContain("persistProposalPlans");
  });

  it("shows pending proposals on the do-not-contact page", () => {
    const src = readFileSync(page, "utf8");
    expect(src).toContain("listPendingFamilyProposals");
    expect(src).toContain("FamilyProposalPanel");
  });

  it("gives the panel Confirm and Reject controls bound to the actions", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("confirmFamilyProposalAction");
    expect(src).toContain("rejectFamilyProposalAction");
    expect(src).toContain("discoverFamilyProposalsAction");
  });

  it("no longer tells the customer the system cannot detect related domains", () => {
    const src = readFileSync(page, "utf8");
    // The live page said this to the owner while working detection sat unused.
    expect(src).not.toContain("without being told");
  });

  it("runs discovery on a schedule, not only when someone clicks", () => {
    const routeSrc = readFileSync(route, "utf8");
    expect(routeSrc).toContain("planClientFamilyProposals");
    expect(routeSrc).toContain("persistProposalPlans");
    // Same bearer-secret pattern as the other internal cron endpoints.
    expect(routeSrc).toContain("PROCESS_QUEUE_SECRET");

    const wf = readFileSync(workflow, "utf8");
    expect(wf).toContain("schedule");
    expect(wf).toContain("/api/internal/suppression/discover-families");
  });
});
