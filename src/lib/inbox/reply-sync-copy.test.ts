import { describe, expect, it } from "vitest";

import {
  formatMailboxLastChecked,
  replySyncButtonLabel,
} from "./reply-sync-copy";

describe("reply sync copy", () => {
  it("uses operator language for checking replies", () => {
    expect(replySyncButtonLabel({ label: "Sophie", provider: "MICROSOFT", lastSyncAt: null })).toBe(
      "Check replies — Sophie",
    );
  });

  it("shows a clear empty last-checked state", () => {
    expect(formatMailboxLastChecked(null)).toBe("Not checked yet");
  });
});
