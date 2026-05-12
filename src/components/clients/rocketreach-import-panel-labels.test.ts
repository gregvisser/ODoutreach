import { describe, expect, it } from "vitest";

import { ROCKETREACH_SIMPLE_SEARCH_LABELS } from "@/lib/clients/rocketreach-simple-search-labels";
import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";

describe("RocketReach simple search labels", () => {
  it("aligns Employer and Job1 Title with the import contract spellings", () => {
    expect(ROCKETREACH_SIMPLE_SEARCH_LABELS.employer).toBe(
      STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[1],
    );
    expect(ROCKETREACH_SIMPLE_SEARCH_LABELS.job1Title).toBe(
      STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[8],
    );
  });

  it("does not use standalone Location as a visible label (RocketReach locality is City / Country)", () => {
    expect(ROCKETREACH_SIMPLE_SEARCH_LABELS.locality).toBe("City / Country");
    for (const v of Object.values(ROCKETREACH_SIMPLE_SEARCH_LABELS)) {
      expect(v).not.toBe("Location");
    }
  });
});
