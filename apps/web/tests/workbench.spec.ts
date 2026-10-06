import { expect, test } from "@playwright/test";

test("product owner creates a synthetic intake through the workbench", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Risk Assessment Workbench" })).toBeVisible();
  await page.getByLabel("Change title").fill("Synthetic browser workflow case");
  await page.getByRole("button", { name: "Create synthetic intake" }).click();

  await expect(page.locator(".demo-bar")).toContainText("Synthetic intake created. Product owner submission is now required.");
  await expect(page.getByRole("heading", { name: /Synthetic browser workflow case/ })).toBeVisible();
});