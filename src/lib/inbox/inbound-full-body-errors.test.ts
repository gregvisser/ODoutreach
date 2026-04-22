import { describe, expect, it } from "vitest";

import {
  classifyInboundFullBodyError,
  type ClassifiedInboundFullBodyError,
} from "./inbound-full-body-errors";

describe("classifyInboundFullBodyError", () => {
  describe("message_not_available", () => {
    it("classifies Microsoft Graph ErrorItemNotFound by code", () => {
      const result = classifyInboundFullBodyError({
        provider: "MICROSOFT",
        errorCode: "ErrorItemNotFound",
        rawMessage:
          "Graph message fetch failed: The specified object was not found in the store., The process failed to get the correct properties.",
      });
      expect(result.category).toBe("message_not_available");
      expect(result.retryable).toBe(false);
      expect(result.title).toMatch(/no longer available/i);
      expect(result.message).toMatch(/moved or deleted/i);
    });

    it("classifies Microsoft Graph ErrorItemNotFound from raw text when code is missing", () => {
      const result = classifyInboundFullBodyError({
        provider: "MICROSOFT",
        errorCode: "",
        rawMessage:
          "Graph message fetch failed: The specified object was not found in the store.",
      });
      expect(result.category).toBe("message_not_available");
    });

    it("classifies Gmail 404 as message_not_available", () => {
      const result = classifyInboundFullBodyError({
        provider: "GOOGLE",
        errorCode: "gmail_404",
        rawMessage: "Gmail message fetch failed: Requested entity was not found.",
      });
      expect(result.category).toBe("message_not_available");
    });

    it("classifies Gmail 404 by http status", () => {
      const result = classifyInboundFullBodyError({
        provider: "GOOGLE",
        errorCode: "",
        rawMessage: "Gmail message fetch failed: Not Found",
        httpStatus: 404,
      });
      expect(result.category).toBe("message_not_available");
    });
  });

  describe("provider_auth_error", () => {
    it("classifies InvalidAuthenticationToken", () => {
      const result = classifyInboundFullBodyError({
        provider: "MICROSOFT",
        errorCode: "InvalidAuthenticationToken",
        rawMessage: "Access token has expired",
      });
      expect(result.category).toBe("provider_auth_error");
      expect(result.title).toMatch(/reconnect/i);
    });

    it("classifies Gmail 401 as auth error", () => {
      const result = classifyInboundFullBodyError({
        provider: "GOOGLE",
        errorCode: "gmail_401",
        rawMessage: "",
      });
      expect(result.category).toBe("provider_auth_error");
    });

    it("classifies HTTP 401 status as auth error", () => {
      const result = classifyInboundFullBodyError({
        provider: "GOOGLE",
        errorCode: "",
        rawMessage: "",
        httpStatus: 401,
      });
      expect(result.category).toBe("provider_auth_error");
    });
  });

  describe("provider_permission_error", () => {
    it("classifies ErrorAccessDenied", () => {
      const result = classifyInboundFullBodyError({
        provider: "MICROSOFT",
        errorCode: "ErrorAccessDenied",
        rawMessage: "Access is denied",
      });
      expect(result.category).toBe("provider_permission_error");
      expect(result.title).toMatch(/permission/i);
    });

    it("classifies Gmail 403 permission error", () => {
      const result = classifyInboundFullBodyError({
        provider: "GOOGLE",
        errorCode: "gmail_403",
        rawMessage: "Request had insufficient authentication scopes.",
      });
      expect(result.category).toBe("provider_permission_error");
    });
  });

  describe("provider_rate_limited", () => {
    it("classifies 429 as rate limited", () => {
      const result = classifyInboundFullBodyError({
        provider: "MICROSOFT",
        errorCode: "ApplicationThrottled",
        rawMessage: "Too many requests",
      });
      expect(result.category).toBe("provider_rate_limited");
      expect(result.retryable).toBe(true);
    });

    it("classifies gmail_429 as rate limited", () => {
      const result = classifyInboundFullBodyError({
        provider: "GOOGLE",
        errorCode: "gmail_429",
        rawMessage: "Rate limit exceeded",
      });
      expect(result.category).toBe("provider_rate_limited");
    });
  });

  describe("provider_unknown", () => {
    it("falls back for unclassified errors", () => {
      const result = classifyInboundFullBodyError({
        provider: "MICROSOFT",
        errorCode: "SomeWeirdCode",
        rawMessage: "Something odd happened",
      });
      expect(result.category).toBe("provider_unknown");
      expect(result.message).toMatch(/could not fetch/i);
      expect(result.retryable).toBe(true);
    });

    it("falls back when all inputs are empty", () => {
      const result = classifyInboundFullBodyError({
        provider: "MICROSOFT",
      });
      expect(result.category).toBe("provider_unknown");
    });

    it("does not leak raw provider text into the operator message", () => {
      const raw =
        "Graph message fetch failed: TOTALLY INTERNAL CODE STACK PATH /var/lib/secret";
      const result: ClassifiedInboundFullBodyError =
        classifyInboundFullBodyError({
          provider: "MICROSOFT",
          errorCode: "UnknownInternalCode",
          rawMessage: raw,
        });
      expect(result.message).not.toContain("TOTALLY INTERNAL CODE STACK");
      expect(result.message).not.toContain("/var/lib/secret");
    });
  });
});
