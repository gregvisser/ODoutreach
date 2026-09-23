import { describe, expect, it } from "vitest";

import {
  classifyAiProviderFailure,
  providerTransportError,
  sanitizeProviderErrorDetail,
} from "./provider-transport-error";

describe("provider transport errors", () => {
  it("names a TimeoutError as a timeout with the budget and no provider body", () => {
    const err = providerTransportError({
      vendor: "xai",
      timeoutMs: 180_000,
      err: new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    });

    expect(err.message).toBe("xai_timeout: exceeded 180000ms");
    expect(classifyAiProviderFailure(err.message)).toBe("timeout");
  });

  it("names a socket failure as network and strips a bearer token", () => {
    const err = providerTransportError({
      vendor: "xai",
      timeoutMs: 180_000,
      err: new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }),
    });

    expect(err.message).toBe("xai_network: fetch failed ECONNRESET");
    expect(classifyAiProviderFailure(err.message)).toBe("network");
    expect(
      sanitizeProviderErrorDetail("bad Bearer xai-supersecretvalue and sk-ant-abcdefghijklmnopqrst"),
    ).not.toMatch(/supersecret|abcdefghij/);
  });

  it("keeps HTTP and parse failures in their own classes", () => {
    expect(classifyAiProviderFailure("xai_http_503: overloaded")).toBe("http");
    expect(classifyAiProviderFailure("xai_http_400: bad request")).toBe("http");
    expect(classifyAiProviderFailure("xai_missing_tool_calls")).toBe("parse");
    expect(classifyAiProviderFailure("xai_tool_arguments_not_json")).toBe("parse");
    expect(classifyAiProviderFailure("unusable_answer")).toBe("parse");
    expect(classifyAiProviderFailure("no_api_key")).toBe("other");
  });
});
