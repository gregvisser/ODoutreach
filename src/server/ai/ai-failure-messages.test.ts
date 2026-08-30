import { describe, expect, it } from "vitest";

import { describeUnhandledAiFailure } from "./ai-failure-messages";

describe("describeUnhandledAiFailure", () => {
  it("names a misconfigured-credentials failure for the workspace-id 400", () => {
    const reason =
      'anthropic_http_400: {"type":"error","error":{"type":"invalid_request_error","message":"anthropic-workspace-id is required when authenticating with an identity-linked API key..."}}';

    expect(describeUnhandledAiFailure(reason)).toBe(
      "The AI's credentials are misconfigured, so nothing ran and nothing was charged. Ask an administrator to check its setup.",
    );
  });

  it("names a misconfigured-credentials failure for a bad-key 401/403", () => {
    expect(describeUnhandledAiFailure("anthropic_http_401: invalid x-api-key")).toContain(
      "misconfigured",
    );
    expect(describeUnhandledAiFailure("anthropic_http_403: forbidden")).toContain(
      "misconfigured",
    );
  });

  it("names a rate-limit failure distinctly from a misconfiguration", () => {
    const message = describeUnhandledAiFailure("anthropic_http_429: rate limited");
    expect(message).toContain("rate-limited");
    expect(message).not.toContain("misconfigured");
  });

  it("names a provider-outage failure for a 5xx, a timeout and an unreadable body", () => {
    expect(describeUnhandledAiFailure("anthropic_http_503: overloaded")).toContain(
      "temporarily unavailable",
    );
    expect(describeUnhandledAiFailure("anthropic_unreadable_body")).toContain(
      "temporarily unavailable",
    );
    expect(describeUnhandledAiFailure("The operation was aborted due to timeout")).toContain(
      "temporarily unavailable",
    );
  });

  it("returns null for a reason it doesn't recognise, so the caller keeps its own message", () => {
    expect(describeUnhandledAiFailure("sequence_not_found")).toBeNull();
    expect(describeUnhandledAiFailure("Not enough replies yet — 6 of the 20 needed.")).toBeNull();
  });
});
