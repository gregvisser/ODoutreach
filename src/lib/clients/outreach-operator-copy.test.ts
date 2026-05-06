import { describe, expect, it } from "vitest";

import {
  OUTREACH_INTERNAL_TOOLS_COPY,
  OUTREACH_PRIMARY_COPY,
} from "./outreach-operator-copy";

describe("outreach operator copy", () => {
  it("keeps the main outreach path free of internal proof/pilot/governed language", () => {
    const primary = JSON.stringify(OUTREACH_PRIMARY_COPY).toLowerCase();

    expect(primary).not.toContain("pilot");
    expect(primary).not.toContain("proof");
    expect(primary).not.toContain("governed");
    expect(primary).not.toContain("test");
  });

  it("keeps internal tools copy clearly secondary", () => {
    expect(OUTREACH_INTERNAL_TOOLS_COPY.title).toBe("Internal tools");
  });
});
