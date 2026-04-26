import { describe, expect, it } from "vitest";

import { isMailboxRemovedFromWorkspace } from "./mailbox-workspace-removal";

describe("isMailboxRemovedFromWorkspace", () => {
  it("is false when workspaceRemovedAt is null", () => {
    expect(isMailboxRemovedFromWorkspace({ workspaceRemovedAt: null })).toBe(false);
  });
  it("is true when workspaceRemovedAt is set", () => {
    expect(
      isMailboxRemovedFromWorkspace({ workspaceRemovedAt: new Date() }),
    ).toBe(true);
  });
});
