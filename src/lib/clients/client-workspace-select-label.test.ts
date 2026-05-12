import { describe, expect, it } from "vitest";

import { formatClientWorkspaceSelectLabel } from "./client-workspace-select-label";

describe("formatClientWorkspaceSelectLabel", () => {
  const clients = [
    { id: "cmob909yy0000ggr1coravvft", name: "OpensDoors" },
    { id: "cmob909yy0000ggr1coravvfu", name: "Acme Ltd" },
  ];

  it("shows the client display name, not the raw id", () => {
    expect(formatClientWorkspaceSelectLabel(clients, "cmob909yy0000ggr1coravvft")).toBe("OpensDoors");
  });

  it("disambiguates when two workspaces share the same name", () => {
    const dup = [
      { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Same" },
      { id: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Same" },
    ];
    expect(formatClientWorkspaceSelectLabel(dup, "aaaaaaaaaaaaaaaaaaaaaaaa")).toBe("Same (aaaaaaaa)");
  });

  it("returns placeholder when id is unknown", () => {
    expect(formatClientWorkspaceSelectLabel(clients, "unknown")).toBe("Choose client");
  });
});
