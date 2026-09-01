import { describe, expect, it } from "vitest";

import {
  actionErrorMessage,
  releaseStaleLocksMessage,
  requeueResultMessage,
  VERIFY_SENDER_SUCCESS_MESSAGE,
} from "./operator-action-messages";

/**
 * Row 157: the operations/outbound mutation buttons discarded their action
 * results, so an owner could never tell a silent refusal from success. These
 * are the pure functions the buttons now use to turn a real action result
 * into banner text — tested directly since this repo's suite is DOM-free
 * (vitest runs in `environment: "node"`, no jsdom/testing-library).
 */

describe("releaseStaleLocksMessage", () => {
  it("reports the actual released count, not just that it ran", () => {
    expect(releaseStaleLocksMessage(3).text).toBe(
      "Released 3 stale processing locks back to QUEUED.",
    );
  });

  it("singularizes for exactly one", () => {
    expect(releaseStaleLocksMessage(1).text).toBe(
      "Released 1 stale processing lock back to QUEUED.",
    );
  });

  it("says plainly when nothing needed releasing, rather than staying silent", () => {
    const banner = releaseStaleLocksMessage(0);
    expect(banner.tone).toBe("ok");
    expect(banner.text).toMatch(/no stale processing locks/i);
  });
});

describe("requeueResultMessage", () => {
  it("surfaces the action's real error text on a refused requeue", () => {
    const banner = requeueResultMessage({
      ok: false,
      error:
        "Could not requeue — only FAILED rows without a provider message id can be safely retried this way.",
    });
    expect(banner.tone).toBe("err");
    expect(banner.text).toBe(
      "Could not requeue — only FAILED rows without a provider message id can be safely retried this way.",
    );
  });

  it("falls back to a plain refusal message if the action ever omits error text", () => {
    const banner = requeueResultMessage({ ok: false });
    expect(banner.tone).toBe("err");
    expect(banner.text.length).toBeGreaterThan(0);
  });

  it("reports success distinctly from failure", () => {
    const banner = requeueResultMessage({ ok: true });
    expect(banner.tone).toBe("ok");
  });
});

describe("actionErrorMessage", () => {
  it("surfaces a thrown Error's message (e.g. an auth guard's Forbidden throw)", () => {
    expect(actionErrorMessage(new Error("Forbidden")).text).toBe("Forbidden");
    expect(actionErrorMessage(new Error("Forbidden")).tone).toBe("err");
  });

  it("never crashes on a non-Error throw", () => {
    const banner = actionErrorMessage("boom");
    expect(banner.tone).toBe("err");
    expect(banner.text.length).toBeGreaterThan(0);
  });
});

describe("VERIFY_SENDER_SUCCESS_MESSAGE", () => {
  it("is non-empty, real feedback rather than silence", () => {
    expect(VERIFY_SENDER_SUCCESS_MESSAGE.length).toBeGreaterThan(0);
  });
});
