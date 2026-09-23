import { describe, expect, it } from "vitest";

import {
  SEQUENCE_DRAFT_START_FAILED_MESSAGE,
  isSequenceDraftRedirectError,
  sequenceDraftClientId,
} from "./sequence-draft-start";

describe("sequence draft start helpers", () => {
  it("recognises a Next.js redirect by its digest", () => {
    const redirect = new Error("NEXT_REDIRECT");
    (redirect as Error & { digest: string }).digest =
      "NEXT_REDIRECT;push;/clients/c1/templates?sequenceDraft=run-1;307;";
    expect(isSequenceDraftRedirectError(redirect)).toBe(true);
    expect(isSequenceDraftRedirectError(new Error("FORBIDDEN_CLIENT"))).toBe(false);
    expect(isSequenceDraftRedirectError(new Error("An unexpected response was received from the server."))).toBe(
      false,
    );
    expect(isSequenceDraftRedirectError("NEXT_REDIRECT")).toBe(false);
    expect(isSequenceDraftRedirectError(null)).toBe(false);
  });

  it("accepts a cuid and rejects values that would change the redirect path", () => {
    expect(sequenceDraftClientId("  clxyz123  ")).toBe("clxyz123");
    expect(sequenceDraftClientId("")).toBeNull();
    expect(sequenceDraftClientId("../admin")).toBeNull();
    expect(sequenceDraftClientId("id?templateError=injected")).toBeNull();
    expect(sequenceDraftClientId("id#hash")).toBeNull();
    expect(sequenceDraftClientId("id/templates")).toBeNull();
    expect(sequenceDraftClientId("a".repeat(129))).toBeNull();
  });

  it("uses one sentence for every start failure", () => {
    expect(SEQUENCE_DRAFT_START_FAILED_MESSAGE).not.toMatch(/forbidden|prisma|xai|api/i);
  });
});
