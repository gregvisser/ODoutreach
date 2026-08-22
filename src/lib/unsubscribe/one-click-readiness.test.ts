import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isOneClickUnsubscribeReady,
  isUnsubscribeRailUsable,
  resolvePublicBaseUrl,
  resolveUnsubscribeRail,
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

describe("resolveUnsubscribeRail", () => {
  it("prefers the hosted rail when an aligned base URL is supplied", () => {
    const rail = resolveUnsubscribeRail({
      alignedBaseUrl: "https://go.clientdomain.com",
      sendingMailboxAddress: "sender@clientdomain.com",
    });
    expect(rail).toEqual({ kind: "hosted", baseUrl: "https://go.clientdomain.com" });
  });

  it("strips trailing slashes from the hosted base URL", () => {
    const rail = resolveUnsubscribeRail({
      alignedBaseUrl: "https://go.clientdomain.com///",
    });
    expect(rail).toEqual({ kind: "hosted", baseUrl: "https://go.clientdomain.com" });
  });

  it("falls to mailto when there is no aligned domain — the normal case today", () => {
    const rail = resolveUnsubscribeRail({
      alignedBaseUrl: null,
      sendingMailboxAddress: "Sender@ClientDomain.com",
    });
    expect(rail).toEqual({ kind: "mailto", address: "sender@clientdomain.com" });
  });

  it("treats a blank aligned base URL as absent", () => {
    const rail = resolveUnsubscribeRail({
      alignedBaseUrl: "   ",
      sendingMailboxAddress: "sender@clientdomain.com",
    });
    expect(rail.kind).toBe("mailto");
  });

  it("returns none when neither rail is available", () => {
    expect(resolveUnsubscribeRail({})).toEqual({ kind: "none" });
    expect(
      resolveUnsubscribeRail({ alignedBaseUrl: null, sendingMailboxAddress: null }),
    ).toEqual({ kind: "none" });
  });

  it("returns none when the sending address is not a usable opt-out target", () => {
    expect(
      resolveUnsubscribeRail({ sendingMailboxAddress: "not-an-address" }),
    ).toEqual({ kind: "none" });
    expect(
      resolveUnsubscribeRail({ sendingMailboxAddress: "a@b.com\r\nX-Evil: 1" }),
    ).toEqual({ kind: "none" });
  });

  it("does NOT read the app base URL from the environment", () => {
    // The app domain must never become an unsubscribe link for a real
    // prospect — that is the misalignment that caused the incident. The
    // caller decides what is safe; the resolver never guesses.
    process.env.AUTH_URL = "https://app-opensdoors-outreach-prod.azurewebsites.net";
    const rail = resolveUnsubscribeRail({
      sendingMailboxAddress: "sender@clientdomain.com",
    });
    expect(rail).toEqual({ kind: "mailto", address: "sender@clientdomain.com" });
  });
});

describe("isUnsubscribeRailUsable", () => {
  it("accepts hosted and mailto, rejects none", () => {
    expect(isUnsubscribeRailUsable({ kind: "hosted", baseUrl: "https://x.com" })).toBe(true);
    expect(isUnsubscribeRailUsable({ kind: "mailto", address: "a@b.com" })).toBe(true);
    expect(isUnsubscribeRailUsable({ kind: "none" })).toBe(false);
  });
});
