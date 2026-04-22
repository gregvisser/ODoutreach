import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isOneClickUnsubscribeReady,
  resolvePublicBaseUrl,
} from "./one-click-readiness";

const ENV_KEYS = ["AUTH_URL", "INTERNAL_APP_URL", "NEXT_PUBLIC_APP_URL"] as const;
const ORIGINAL = new Map<string, string | undefined>();

beforeEach(() => {
  for (const k of ENV_KEYS) {
    ORIGINAL.set(k, process.env[k]);
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = ORIGINAL.get(k);
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

describe("resolvePublicBaseUrl", () => {
  it("returns null when no public URL env is set", () => {
    expect(resolvePublicBaseUrl()).toBeNull();
    expect(isOneClickUnsubscribeReady()).toBe(false);
  });

  it("prefers AUTH_URL over other envs", () => {
    process.env.AUTH_URL = "https://outreach.example.com";
    process.env.INTERNAL_APP_URL = "https://ignored.example.com";
    expect(resolvePublicBaseUrl()).toBe("https://outreach.example.com");
    expect(isOneClickUnsubscribeReady()).toBe(true);
  });

  it("strips trailing slashes", () => {
    process.env.AUTH_URL = "https://outreach.example.com///";
    expect(resolvePublicBaseUrl()).toBe("https://outreach.example.com");
  });

  it("falls through to INTERNAL_APP_URL when AUTH_URL is blank", () => {
    process.env.AUTH_URL = "   ";
    process.env.INTERNAL_APP_URL = "https://internal.example.com";
    expect(resolvePublicBaseUrl()).toBe("https://internal.example.com");
  });

  it("rejects non-http(s) schemes", () => {
    process.env.AUTH_URL = "file:///etc/passwd";
    expect(resolvePublicBaseUrl()).toBeNull();
    expect(isOneClickUnsubscribeReady()).toBe(false);
  });

  it("rejects malformed URLs", () => {
    process.env.AUTH_URL = "not a url";
    expect(resolvePublicBaseUrl()).toBeNull();
  });

  it("accepts localhost origins for local dev", () => {
    process.env.AUTH_URL = "http://localhost:3000";
    expect(isOneClickUnsubscribeReady()).toBe(true);
  });
});
