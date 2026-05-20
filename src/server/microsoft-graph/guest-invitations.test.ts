import { describe, expect, it, vi } from "vitest";

const { graphFetch } = vi.hoisted(() => ({
  graphFetch: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("./app-client", () => ({
  graphFetch,
}));

import {
  getGuestUserExternalState,
  GraphUserReadError,
} from "./guest-invitations";

describe("getGuestUserExternalState", () => {
  it("maps Graph 403 user-read failures to a safe User.Read.All diagnostic", async () => {
    graphFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "Authorization_RequestDenied",
            message: "Insufficient privileges to complete the operation.",
            innerError: {
              date: "2026-05-20T09:47:40",
              "request-id": "e87128f8-f3a4-49db-a7fc-eaf4d2dbdd28",
            },
          },
        }),
        { status: 403 },
      ),
    );

    try {
      await getGuestUserExternalState("guest-object-id");
      throw new Error("expected getGuestUserExternalState to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(GraphUserReadError);
      const message = e instanceof Error ? e.message : String(e);
      expect(message).toContain("Microsoft Graph cannot read invited users.");
      expect(message).toContain("User.Read.All");
      expect(message).toContain("request-id e87128f8-f3a4-49db-a7fc-eaf4d2dbdd28");
      expect(message).not.toContain("Authorization_RequestDenied");
      expect(message).not.toContain("Insufficient privileges to complete the operation");
      expect(message).not.toMatch(/"error"\s*:/);
    }
  });
});
