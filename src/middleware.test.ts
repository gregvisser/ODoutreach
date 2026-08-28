import { describe, expect, it } from "vitest";

import { isPublicPath } from "./lib/public-paths";

describe("isPublicPath", () => {
  it("allows public health and build marker endpoints", () => {
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/api/build-info")).toBe(true);
    expect(isPublicPath("/api/internal/replies/sync")).toBe(true);
  });

  it("allows the cron-driven internal routes so their bearer-token calls are not redirected to sign-in", () => {
    expect(isPublicPath("/api/internal/outbound/process-queue")).toBe(true);
    expect(isPublicPath("/api/internal/sequences/advance")).toBe(true);
    expect(isPublicPath("/api/internal/suppression/sync-all")).toBe(true);
  });

  it("allows PWA install assets so the manifest loads and the service worker registers without a session", () => {
    expect(isPublicPath("/manifest.webmanifest")).toBe(true);
    expect(isPublicPath("/sw.js")).toBe(true);
    expect(isPublicPath("/icons/icon-512.png")).toBe(true);
  });

  it("allows the legal pages so Google's OAuth reviewer and a cold prospect can open them without a login", () => {
    // Google will not let an external OAuth app be published unless the privacy
    // policy and terms URLs are reachable anonymously — a redirect to /sign-in
    // reads to their crawler as a missing page. Recipients of our outreach have
    // no login either, and they are the people the policy is about.
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/terms")).toBe(true);
  });

  it("allows the open-tracking pixel so a recipient's mail client gets the GIF and not a sign-in page", () => {
    // The pixel is fetched by the mail client of someone who has no account and
    // never will. Behind the session it answered every recipient with a 307 to
    // /sign-in, so `openedAt` was never written and every open rate in the
    // product read 0% for a reason that had nothing to do with recipients.
    //
    // A PREFIX, not the exact path: the token is part of the path, so there is
    // no fixed string to match, and a future `/api/track/click/<token>` rail is
    // unreachable for exactly the same reason. Everything under `/api/track/`
    // is by definition addressed to a recipient rather than to a staff session.
    // It is not widened past that — `/api/` as a whole stays protected.
    expect(isPublicPath("/api/track/open/abc123")).toBe(true);
  });

  it("keeps the staff notifications poll behind the session (not public)", () => {
    expect(isPublicPath("/api/notifications/replies")).toBe(false);
  });

  it("keeps application pages protected by default", () => {
    expect(isPublicPath("/clients/example")).toBe(false);
  });
});
