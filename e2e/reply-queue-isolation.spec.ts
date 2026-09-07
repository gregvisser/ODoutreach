import { test, expect } from "@playwright/test";
import { E2E_REPLY_QUEUE as fixture, E2E_STORAGE_STATE } from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

test("operations directs a failed mailbox reply to its original message and keeps ordinary retry available", async ({ page }) => {
  await page.goto(`/operations/outbound?client=${fixture.clientId}`);
  const content = page.getByRole("main");
  const replyRow = content.getByRole("row").filter({ hasText: fixture.replyRecipient });
  await expect(replyRow).toHaveCount(1);
  await expect(replyRow.getByRole("button", { name: "Requeue", exact: true })).toHaveCount(0);
  await expect(replyRow.getByText("Review this reply there; it cannot be retried from this queue.", { exact: true })).toBeVisible();
  const ordinaryRow = content.getByRole("row").filter({ hasText: fixture.ordinaryRecipient });
  await expect(ordinaryRow.getByRole("button", { name: "Requeue", exact: true })).toBeEnabled();
  const original = replyRow.getByRole("link", { name: "Open original message", exact: true });
  await expect(original).toHaveAttribute("href", `/clients/${fixture.clientId}/activity/messages/${fixture.messageId}`);
  await original.click();
  await expect(page).toHaveURL(new RegExp(`/clients/${fixture.clientId}/activity/messages/${fixture.messageId}$`));
  await expect(page.getByRole("textbox", { name: "Reply body" })).toBeVisible();
  // Navigation only. Neither Requeue nor Send reply is ever clicked.
});
