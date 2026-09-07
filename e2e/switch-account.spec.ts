import { expect, test } from "@playwright/test";
import { E2E_STORAGE_STATE } from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.staff });

// The local app and Auth.js client are real. Intercept only the OAuth handoff;
// these checks do not authenticate to Microsoft or mint a different identity.
test("desktop switch requests Microsoft's account chooser and returns to Reports", async ({
  page,
}) => {
  let requestDetails:
    | {
        method: string;
        prompt: string | null;
        callback: string | null;
        csrf: boolean;
      }
    | undefined;
  const chooser = "https://login.microsoftonline.com/account-picker-fixture";
  await page.route(chooser, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Test account chooser</h1>",
    }),
  );
  await page.route(
    "**/api/auth/signin/microsoft-entra-id?**",
    async (route) => {
      const request = route.request();
      const body = new URLSearchParams(request.postData() ?? "");
      requestDetails = {
        method: request.method(),
        prompt: new URL(request.url()).searchParams.get("prompt"),
        callback: body.get("callbackUrl"),
        csrf: !!body.get("csrfToken"),
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ url: chooser }),
      });
    },
  );
  await page.goto("/reporting");
  await page
    .getByRole("button", { name: "Switch account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Test account chooser" }),
  ).toBeVisible();
  expect(requestDetails).toEqual({
    method: "POST",
    prompt: "select_account",
    callback: "/reporting",
    csrf: true,
  });
});

test("phone menu exposes switch account and allows retry after a failed handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 560 });
  let attempts = 0;
  await page.route(
    "**/api/auth/signin/microsoft-entra-id?**",
    async (route) => {
      attempts++;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          url: new URL(
            "/api/auth/error?error=OAuthSignin",
            route.request().url(),
          ).href,
        }),
      });
    },
  );
  await page.goto("/reporting");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Navigation" });
  const button = menu.getByRole("button", {
    name: "Switch account",
    exact: true,
  });
  await expect(button).toBeVisible();
  await button.click();
  await expect(menu.getByRole("alert")).toHaveText(
    "Could not open Microsoft. Please try again.",
  );
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => attempts).toBe(2);
  await expect(button).toBeEnabled();
  await expect(page).toHaveURL(/\/reporting$/);
});
