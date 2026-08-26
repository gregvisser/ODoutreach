import { describe, expect, it } from "vitest";

import {
  INSTALL_DISMISS_KEY,
  isInstallPromptDismissed,
  recordInstallPromptDismissed,
  resolveDismissStorageKind,
  type InstallDismissStores,
  type StorageLike,
} from "./install-dismissal";

/** An in-memory `Storage` stand-in. `survives` = false models a new tab / restart. */
function fakeStore(seed: Record<string, string> = {}): StorageLike & {
  readonly data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

function throwingStore(): StorageLike {
  return {
    getItem: () => {
      throw new Error("storage blocked");
    },
    setItem: () => {
      throw new Error("storage blocked");
    },
  };
}

describe("resolveDismissStorageKind", () => {
  it("uses localStorage on a pointer-primary device, so a desktop dismiss is final", () => {
    expect(resolveDismissStorageKind({ isTouchPrimary: false })).toBe("local");
  });

  it("uses sessionStorage on a touch-primary device, so a phone keeps being asked", () => {
    expect(resolveDismissStorageKind({ isTouchPrimary: true })).toBe("session");
  });
});

describe("the defect this test exists for: the banner came back every restart", () => {
  // The shipped behaviour wrote the flag to sessionStorage on every device, so
  // opening a new tab — or opening Chrome the next morning — put a fixed
  // bottom-of-screen banner back over the /reporting table. This asserts the
  // desktop flag survives that.
  it("a desktop dismissal is still honoured in a brand-new browser session", () => {
    const local = fakeStore();
    const firstSession: InstallDismissStores = { local, session: fakeStore() };
    const kind = resolveDismissStorageKind({ isTouchPrimary: false });

    recordInstallPromptDismissed(firstSession, kind);
    expect(local.data[INSTALL_DISMISS_KEY]).toBe("1");

    // New tab / browser restart: sessionStorage is empty again, localStorage is not.
    const nextSession: InstallDismissStores = { local, session: fakeStore() };
    expect(isInstallPromptDismissed(nextSession, kind)).toBe(true);
  });

  it("a phone dismissal is NOT carried into the next visit (standing PWA rule)", () => {
    const local = fakeStore();
    const kind = resolveDismissStorageKind({ isTouchPrimary: true });

    recordInstallPromptDismissed({ local, session: fakeStore() }, kind);

    // Nothing was written to the durable area, so next visit prompts again.
    expect(local.data[INSTALL_DISMISS_KEY]).toBeUndefined();
    expect(isInstallPromptDismissed({ local, session: fakeStore() }, kind)).toBe(false);
  });
});

describe("isInstallPromptDismissed", () => {
  it("is false when nothing was ever stored", () => {
    expect(
      isInstallPromptDismissed({ local: fakeStore(), session: fakeStore() }, "local"),
    ).toBe(false);
  });

  it("reads only the area it was told to read", () => {
    const stores: InstallDismissStores = {
      local: fakeStore(),
      session: fakeStore({ [INSTALL_DISMISS_KEY]: "1" }),
    };
    expect(isInstallPromptDismissed(stores, "session")).toBe(true);
    expect(isInstallPromptDismissed(stores, "local")).toBe(false);
  });

  it("treats an unavailable storage as not-dismissed rather than crashing the page", () => {
    expect(isInstallPromptDismissed({ local: null, session: null }, "local")).toBe(false);
    expect(
      isInstallPromptDismissed({ local: throwingStore(), session: null }, "local"),
    ).toBe(false);
  });
});

describe("recordInstallPromptDismissed", () => {
  it("never throws when storage is missing or blocked", () => {
    expect(() =>
      recordInstallPromptDismissed({ local: null, session: null }, "local"),
    ).not.toThrow();
    expect(() =>
      recordInstallPromptDismissed({ local: throwingStore(), session: null }, "local"),
    ).not.toThrow();
  });
});
