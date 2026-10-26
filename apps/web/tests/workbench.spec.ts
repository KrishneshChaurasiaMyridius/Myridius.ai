import { expect, test } from "@playwright/test";

test("product owner creates a synthetic intake through the workbench", async ({ page }) => {
  const actorHeaders: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/cases") {
      actorHeaders.push(request.headers()["x-actor-id"] ?? "");
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Risk Assessment Workbench" })).toBeVisible();
  await expect(page.getByText("SYNTHETIC DEMO", { exact: true })).toBeVisible();
  await page.getByLabel("Change title").fill("Synthetic browser workflow case");
  await page.getByRole("button", { name: "Create synthetic intake" }).click();

  await expect(page.locator(".demo-bar")).toContainText("Synthetic intake created. Product owner submission is now required.");
  await expect(page.getByRole("heading", { name: /Synthetic browser workflow case/ })).toBeVisible();
  expect(actorHeaders).toContain("product-owner");
});

test("analyst reviews deterministic scores and structured assessment draft", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Change title").fill("Synthetic analyst review workflow case");
  await page.getByRole("button", { name: "Create synthetic intake" }).click();
  await page.getByRole("button", { name: "Submit for intake review" }).click();
  await expect(page.locator(".demo-bar")).toContainText("Case submitted for intake review.");

  await page.getByLabel("Acting as").selectOption("analyst");
  const handoff = page.locator(".inbox li").filter({ hasText: "Synthetic analyst review workflow case" });
  const acknowledgeButton = handoff.getByRole("button", { name: "Open and acknowledge" }).first();
  await expect(acknowledgeButton).toBeEnabled();
  await acknowledgeButton.click();
  await expect(page.locator(".demo-bar")).toContainText("Workflow handoff acknowledged.");
  await expect(page.locator("#case-workspace")).toBeInViewport();
  await page.getByRole("button", { name: "Run risk assessment" }).click();
  await expect(page.getByRole("heading", { name: "Analyst recommendation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How the score was calculated" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare cited draft" }).click();

  await expect(page.getByRole("heading", { name: "Risk factor analysis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Control observations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence gaps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved source excerpts" })).toBeVisible();
});