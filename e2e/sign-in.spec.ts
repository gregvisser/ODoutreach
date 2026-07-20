import { test, expect } from "@playwright/test";

// Unauthenticated journeys — runnable against a running app with no test data.
test.describe("sign-in", () => {
  test("the sign-in page renders", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("button").or(page.getByRole("link")).first()).toBeVisible();
  });

  test("anonymous users are redirected away from protected routes", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
