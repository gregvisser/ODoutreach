import { describe, expect, it } from "vitest";

import {
  universeListSequenceCtaHref,
  universeListSequenceCtaLabel,
} from "./list-created-cta";

describe("universeListSequenceCtaHref", () => {
  it("resolves to the given client's Outreach tab", () => {
    expect(universeListSequenceCtaHref("client-123")).toBe(
      "/clients/client-123/outreach",
    );
  });

  it("resolves to a DIFFERENT client's Outreach tab for a different id — not hardcoded", () => {
    expect(universeListSequenceCtaHref("client-abc")).toBe(
      "/clients/client-abc/outreach",
    );
  });
});

describe("universeListSequenceCtaLabel", () => {
  it("names the list that was just created", () => {
    expect(universeListSequenceCtaLabel("Manchester FDs — May 2026")).toBe(
      'Build a sequence with "Manchester FDs — May 2026"',
    );
  });
});
