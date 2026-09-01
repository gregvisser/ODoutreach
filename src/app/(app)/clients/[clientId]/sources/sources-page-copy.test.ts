import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONTACT_IMPORT_CONTRACT_SUMMARY } from "@/lib/contact-import-contract";

const sourcesPagePath = join(
  process.cwd(),
  "src/app/(app)/clients/[clientId]/sources/page.tsx",
);
const rocketReachPanelPath = join(
  process.cwd(),
  "src/components/clients/rocketreach-import-panel.tsx",
);

describe("Client Sources page copy", () => {
  it("does not explain Universe architecture in the intro", () => {
    const src = readFileSync(sourcesPagePath, "utf8");
    expect(src).toContain("Import contacts into a named list for this client");
    expect(src).not.toContain("Each import saves people to");
    expect(src).not.toContain("shared across clients");
    expect(src).not.toContain("to pick individuals and build lists for any client");
  });

  it("gates RocketReach advanced JSON on ROCKETREACH_IMPORT_JSON_DEBUG, not staff role", () => {
    const src = readFileSync(sourcesPagePath, "utf8");
    expect(src).toContain("ROCKETREACH_IMPORT_JSON_DEBUG");
    expect(src).not.toMatch(/allowAdvancedRocketReachJson=\{[^}]*staff\.role/);
  });

  // PR #138: Sources must surface the twelve-field contact contract on the
  // page itself (not just inside the deeply-nested CSV / RocketReach forms),
  // so staff can see at a glance what every import writes.
  it("renders the twelve-field contract from the shared constant (PR #138)", () => {
    const src = readFileSync(sourcesPagePath, "utf8");
    expect(src).toContain("STAFF_VISIBLE_CONTACT_IMPORT_HEADERS");
    expect(src).toContain("What we import for every contact");
    expect(src).toContain("Contact import fields");
  });

  // Row 151 (raised by row 135/cycle195 finding 2): the page used to say a
  // LinkedIn/mobile/office-only contact "must have at least one of email,
  // LinkedIn, mobile, or office number to be saved" — implying it is saved
  // without outreach. EMAIL_REQUIRED_FOR_PERSISTENCE means it is never
  // persisted at all. The copy must say that plainly, and must not repeat
  // the old false claim.
  it("states plainly that a row with no usable email is skipped, not saved (row 151)", () => {
    const src = readFileSync(sourcesPagePath, "utf8");
    expect(src).not.toContain(
      "A contact must have at least one of email, LinkedIn, mobile, or office number to be saved.",
    );
    // The page must render the shared contract constant rather than its own
    // hardcoded copy, so this claim cannot drift from the write behaviour
    // (`EMAIL_REQUIRED_FOR_PERSISTENCE`) or from the training module again.
    expect(src).toContain("CONTACT_IMPORT_CONTRACT_SUMMARY");
    expect(CONTACT_IMPORT_CONTRACT_SUMMARY.rules.join(" ")).toMatch(
      /skipped and never saved/,
    );
  });
});

describe("RocketReach Sources panel (PR #138)", () => {
  it("renders search controls as a visible section, not a collapsed details block", () => {
    const src = readFileSync(rocketReachPanelPath, "utf8");
    // The visible <section> must hold the search controls.
    expect(src).toContain('aria-label="RocketReach prospect search"');
    // The legacy "Search from this app (optional)" details summary must
    // be gone — the user reported staff couldn't find the search.
    expect(src).not.toContain("Search from this app (optional)");
  });

  it("shows a professional brand block on the card header", () => {
    const src = readFileSync(rocketReachPanelPath, "utf8");
    expect(src).toContain("Search prospects on");
    // No logo asset in the repo today — text brand block is the contract.
    // The brand block uses an aria-hidden monogram + the word "RocketReach".
    expect(src).toContain("RocketReach");
  });

  it("keeps the live-search confirmation phrase + credit warning intact", () => {
    const src = readFileSync(rocketReachPanelPath, "utf8");
    // Live searches must still require the confirmation phrase and show
    // the credit warning. Lowering this bar would be a safety regression.
    expect(src).toContain("ROCKETREACH_IMPORT_CONFIRMATION_PHRASE");
    expect(src).toContain("RocketReach may use credits");
    expect(src).toContain("confirmationOk");
  });
});
