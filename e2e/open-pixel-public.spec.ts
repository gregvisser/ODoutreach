import { test, expect } from "@playwright/test";

/**
 * The open-tracking pixel must be reachable by someone who is not logged in.
 *
 * It is requested by the mail client of a recipient who has no account and never
 * will. While it sat behind the auth middleware, every one of those requests got
 * a 307 to /sign-in instead of the 43-byte GIF, so `openedAt` was never written
 * and every open rate in the product read 0% for a reason that had nothing to do
 * with recipients — built, wired, reporting success, never firing.
 *
 * Asserted over raw HTTP via `request` (no browser session, no storage state)
 * rather than through a rendered page, because the failure mode is specifically
 * an auth *redirect*: the route works perfectly for a signed-in developer and
 * bounces everyone else.
 *
 * REACHABILITY ONLY. This proves the endpoint answers; it does not prove an open
 * was ever recorded, and it must not be read that way. Open tracking is off for
 * every client by default (`decideClientOpenTracking` needs a deliberate
 * per-client opt-in AND a DNS-verified aligned domain), so no pixel is embedded
 * in any mail today. This test guards the rail, not the traffic on it.
 */
test.describe("open-tracking pixel is reachable without a session", () => {
  test("returns a 200 image/gif with no session", async ({ request }) => {
    // A token that matches no OutboundEmail row. The route is documented to
    // treat an unknown id exactly like a known one — it must never leak whether
    // an id exists, and a recipient must never see a broken image.
    const response = await request.get("/api/track/open/e2e-no-such-token", {
      // maxRedirects: 0 — following the redirect would turn the sign-in bounce
      // into a 200 on the WRONG resource and quietly pass.
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/gif");
    expect(response.url()).not.toContain("/sign-in");
  });

  /**
   * Control. A 200 above only means something if a 200 actually distinguishes a
   * public route from a protected one. Were the middleware bypassed wholesale —
   * misconfigured matcher, disabled auth in this environment — the assertion
   * would pass for entirely the wrong reason and this spec would be decorative.
   * A protected route fetched the identical way must NOT be 200.
   */
  test("control: a protected route fetched the same way is not 200", async ({
    request,
  }) => {
    const response = await request.get("/dashboard", { maxRedirects: 0 });
    expect(response.status()).not.toBe(200);
  });
});
