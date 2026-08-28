import { test, expect } from "@playwright/test";

/**
 * The legal pages must be reachable by someone who has no account and never will.
 *
 * Two audiences, neither of whom can sign in:
 *
 *   1. Google's OAuth verification reviewer. An external OAuth app cannot be
 *      published without a reachable privacy-policy URL and terms URL, and a
 *      302 to /sign-in reads to them as a missing page. Until they resolve
 *      anonymously, every Google Workspace client's mailbox tokens keep
 *      expiring seven days after consent.
 *   2. A prospect who received our outreach and wants to know who has their
 *      details. They are the subject of the policy; making them log in to read
 *      it would be absurd.
 *
 * This asserts the raw HTTP status via `request` (no browser session, no
 * storage state) rather than a rendered page, because the failure mode being
 * guarded is specifically an auth *redirect* — a page that renders fine for a
 * signed-in developer and 302s for everyone else.
 */
test.describe("legal pages are public", () => {
  for (const path of ["/privacy", "/terms"]) {
    test(`${path} returns 200 with no session`, async ({ request }) => {
      // maxRedirects: 0 — following a redirect would turn the sign-in bounce
      // into a 200 on the WRONG page and quietly pass.
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.url()).not.toContain("/sign-in");
    });
  }

  /**
   * Control. The assertions above are only meaningful if a 200 actually
   * distinguishes a public page from a protected one — if the middleware were
   * bypassed entirely they would pass for the wrong reason and this whole spec
   * would be decorative. A protected route fetched the same way must NOT be
   * 200, which proves the method detects the failure mode it exists to catch.
   */
  test("control: a protected route fetched the same way is not 200", async ({
    request,
  }) => {
    const response = await request.get("/dashboard", { maxRedirects: 0 });
    expect(response.status()).not.toBe(200);
  });

  test("both pages render their heading and are marked as an unreviewed draft", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { name: /privacy/i, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("legal-draft-notice")).toBeVisible();

    // The footer link is the route a real person takes between them.
    await page.getByRole("link", { name: "Terms of Service" }).first().click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(
      page.getByRole("heading", { name: /terms/i, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("legal-draft-notice")).toBeVisible();
  });
});
