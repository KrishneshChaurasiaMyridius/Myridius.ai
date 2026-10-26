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
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  await expect(page.getByText(/Required role:/)).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "product owner workflow navigation" }).getByRole("link", { name: "New intake" })).toBeVisible();
  await page.getByLabel("Change title").fill("Browser workflow case");
  await page.getByRole("button", { name: "Create intake" }).click();

  await expect(page.locator(".demo-bar")).toContainText("Intake created. Product owner submission is now required.");
  await expect(page.getByRole("heading", { name: /Browser workflow case/ })).toBeVisible();
  const recordEvidence = await page.getByRole("button", { name: "Record and extract evidence" }).boundingBox();
  const submitIntake = await page.getByRole("button", { name: "Submit for intake review" }).boundingBox();
  expect(recordEvidence).not.toBeNull();
  expect(submitIntake).not.toBeNull();
  expect(recordEvidence!.y).toBe(submitIntake!.y);
  expect(recordEvidence!.x).toBeLessThan(submitIntake!.x);
  expect(actorHeaders).toContain("product-owner");
});

test("analyst reviews deterministic scores and structured assessment draft", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Change title").fill("Analyst review workflow case");
  await page.getByRole("button", { name: "Create intake" }).click();
  await page.getByRole("button", { name: "Submit for intake review" }).click();
  await expect(page.locator(".demo-bar")).toContainText("Case submitted for intake review.");

  await page.getByLabel("Acting as").selectOption("analyst");
  await expect(page.getByRole("navigation", { name: "analyst workflow navigation" }).getByRole("link", { name: "Active review" })).toBeVisible();
  await expect(page.getByLabel("Change title")).toHaveCount(0);
  await page.locator(".inbox summary").click();
  const handoff = page.locator(".inbox li").filter({ hasText: "Analyst review workflow case" });
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
  await expect(page.getByText("DEMO SAMPLE · NOT AUTHORITATIVE")).toBeVisible();
});

test("administrator and committee govern source-linked policy revisions", async ({ page }) => {
  const sourceRun = Date.now().toString();
  const firstSourceId = `HACKATHON-${sourceRun}-01`;
  const secondSourceId = `HACKATHON-${sourceRun}-02`;
  await page.goto("/");
  await page.getByLabel("Acting as").selectOption("administrator");
  const navigation = page.getByRole("navigation", { name: "administrator workflow navigation" });
  await navigation.getByRole("link", { name: "Policy sources" }).click();
  await expect(page.getByText("Sample policy entries are for demonstration only", { exact: false })).toBeVisible();

  await page.getByLabel("Source ID").fill(firstSourceId);
  await page.getByLabel("Title", { exact: true }).fill("Hackathon Policy Version One");
  await page.getByLabel("Source URL").fill("https://policy.example.test/hackathon-v1");
  await page.getByLabel("Policy excerpt").fill("E2E policy excerpt used only to verify version approval and retirement handling.");
  await page.getByRole("button", { name: "Register source for review" }).click();
  const firstVersion = page.locator(".policy-list li").filter({ hasText: new RegExp(`${firstSourceId} · v1 ·`) });
  await expect(firstVersion).toContainText("v1");
  await expect(firstVersion).toContainText("pending review");

  await page.getByLabel("Acting as").selectOption("committee");
  const approveFirstVersion = firstVersion.getByRole("button", { name: "Approve" });
  await expect(approveFirstVersion).toBeEnabled();
  await approveFirstVersion.click();
  await expect(firstVersion).toContainText("approved");

  await page.getByLabel("Acting as").selectOption("administrator");
  await page.getByLabel("Source ID").fill(secondSourceId);
  await page.getByLabel("Revision of").selectOption(firstSourceId);
  await expect(page.getByRole("spinbutton", { name: "Version" })).toHaveValue("2");
  await page.getByLabel("Title", { exact: true }).fill("Hackathon Policy Version Two");
  await page.getByLabel("Source URL").fill("https://policy.example.test/hackathon-v2");
  await page.getByLabel("Policy excerpt").fill("Updated E2E policy excerpt for testing approval-gated version replacement.");
  await page.getByRole("button", { name: "Register source for review" }).click();
  const secondVersion = page.locator(".policy-list li").filter({ hasText: new RegExp(`${secondSourceId} · v2 ·`) });
  await expect(secondVersion).toContainText("v2");
  await expect(secondVersion).toContainText("pending review");

  await page.getByLabel("Acting as").selectOption("committee");
  await secondVersion.getByRole("button", { name: "Approve" }).click();
  await expect(secondVersion).toContainText("approved");
  await expect(firstVersion).toContainText(`superseded by ${secondSourceId}`);
});