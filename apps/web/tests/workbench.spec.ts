import { expect, test } from "@playwright/test";

test("product owner creates a synthetic intake through the workbench", async ({ page }) => {
  const actorHeaders: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/cases") {
      actorHeaders.push(request.headers()["x-actor-id"] ?? "");
    }
  });

  await page.goto("/");

  await expect(page.getByText("Risk Workbench", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo mode", { exact: true })).toBeVisible();
  await expect(page.getByText(/Required role:/)).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "product owner workspace" }).getByRole("link", { name: "New intake" })).toBeVisible();
  await page.locator("#product-intake input").first().fill("Browser workflow case");
  await page.getByRole("button", { name: "Create intake" }).click();

  await expect(page.locator(".toast")).toContainText("Intake created. Product owner submission is now required.");
  await expect(page.locator(".workbench-main > .inbox")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /Browser workflow case/ })).toBeVisible();
  const recordEvidence = await page.getByRole("button", { name: "Record and extract evidence" }).boundingBox();
  const submitIntake = await page.getByRole("button", { name: "Submit for intake review" }).boundingBox();
  expect(recordEvidence).not.toBeNull();
  expect(submitIntake).not.toBeNull();
  expect(recordEvidence!.y).toBe(submitIntake!.y);
  expect(recordEvidence!.x).toBeLessThan(submitIntake!.x);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".case-list")).toHaveCSS("max-height", "320px");
  const mobileEvidence = await page.getByRole("button", { name: "Record and extract evidence" }).boundingBox();
  const mobileSubmit = await page.getByRole("button", { name: "Submit for intake review" }).boundingBox();
  expect(mobileEvidence).not.toBeNull();
  expect(mobileSubmit).not.toBeNull();
  expect(mobileEvidence!.y).toBe(mobileSubmit!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(actorHeaders).toContain("product-owner");
});

test("analyst reviews deterministic scores and structured assessment draft", async ({ page }) => {
  await page.goto("/");
  await page.locator("#product-intake input").first().fill("Analyst review workflow case");
  await page.getByRole("button", { name: "Create intake" }).click();
  await page.getByRole("button", { name: "Submit for intake review" }).click();
  await expect(page.locator(".toast")).toContainText("Case submitted for intake review.");

  await page.getByLabel("Acting as").selectOption("analyst");
  await expect(page.getByRole("navigation", { name: "analyst workspace" }).getByRole("link", { name: "Active review" })).toBeVisible();
  await expect(page.locator("#product-intake")).toHaveCount(0);
  await page.locator(".inbox summary").click();
  const handoff = page.locator(".inbox li").filter({ hasText: "Analyst review workflow case" });
  const acknowledgeButton = handoff.getByRole("button", { name: "Open and acknowledge" }).first();
  await expect(acknowledgeButton).toBeEnabled();
  await acknowledgeButton.click();
  await expect(page.locator(".toast")).toContainText("Workflow handoff acknowledged.");
  await expect(page.locator("#case-workspace")).toBeInViewport();
  await page.getByRole("button", { name: "Run risk assessment" }).click();
  await expect(page.getByRole("heading", { name: "Analyst recommendation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How the score was calculated" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare cited draft" }).click();

  await expect(page.getByRole("heading", { name: "Risk factor analysis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Control observations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence gaps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved source excerpts" })).toBeVisible();
  await expect(page.getByText("DEMO SAMPLE · NOT AUTHORITATIVE").first()).toBeVisible();
  await expect(page.locator(".draft-purpose")).toContainText("does not decide or approve the case");
  await page.getByRole("button", { name: "Send to committee" }).click();
  await expect(page.locator(".toast")).toContainText("Case sent to committee.");
  await page.getByLabel("Acting as").selectOption("committee");
  const committeeHandoff = page.locator(".inbox li").filter({ hasText: "Analyst review workflow case" });
  await committeeHandoff.getByRole("button", { name: "Open and acknowledge" }).click();
  await expect(page.getByLabel("Condition owner")).toHaveValue("");
});

test("all personas have visible navigation targets", async ({ page }) => {
  const personas = [
    { actor: "product-owner", name: "product owner", links: { Cases: "case-queue", "Workflow inbox": "work-inbox", "New intake": "product-intake", "Evidence library": "evidence-library", "Audit log": "audit-timeline" } },
    { actor: "analyst", name: "analyst", links: { Cases: "case-queue", "Workflow inbox": "work-inbox", "Active review": "case-workspace", "Evidence library": "evidence-library", "Audit log": "audit-timeline", "Scoring rules": "risk-configuration" } },
    { actor: "committee", name: "committee member", links: { Cases: "case-queue", "Workflow inbox": "work-inbox", "Decision review": "case-workspace", "Evidence library": "evidence-library", "Audit log": "audit-timeline", "Policy sources": "policy-library" } },
    { actor: "administrator", name: "administrator", links: { Cases: "case-queue", "Workflow inbox": "work-inbox", "Evidence library": "evidence-library", "Audit log": "audit-timeline", "Policy sources": "policy-library", "Scoring rules": "risk-configuration" } },
    { actor: "auditor", name: "auditor", links: { Cases: "case-queue", "Workflow inbox": "work-inbox", "Evidence library": "evidence-library", "Audit log": "audit-timeline" } },
  ];

  await page.goto("/");
  await expect(page.getByLabel("Acting as").locator("option")).toHaveCount(5);
  for (const persona of personas) {
    await page.getByLabel("Acting as").selectOption(persona.actor);
    const navigation = page.getByRole("navigation", { name: `${persona.name} workspace` });
    for (const [label, target] of Object.entries(persona.links)) {
      const link = navigation.locator(`a[href="#${target}"]`);
      await expect(link).toContainText(label);
      await expect(page.locator(`#${target}`)).toHaveCount(1);
    }
  }
});

test("administrator and committee govern source-linked policy revisions", async ({ page }) => {
  const sourceRun = Date.now().toString();
  const firstSourceId = `HACKATHON-${sourceRun}-01`;
  const secondSourceId = `HACKATHON-${sourceRun}-02`;
  await page.goto("/");
  await page.getByLabel("Acting as").selectOption("administrator");
  const navigation = page.getByRole("navigation", { name: "administrator workspace" });
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

test("product owner uploads synthetic text and sees extracted cues separately from its hash", async ({ page }) => {
  await page.goto("/");
  await page.locator("#product-intake input").first().fill("Evidence upload workflow case");
  await page.getByRole("button", { name: "Create intake" }).click();
  await expect(page.locator(".toast")).toContainText("Intake created.");
  await page.locator('#evidence-upload input[type="file"]').setInputFiles({
    name: "synthetic-controls.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Synthetic GB and US cross-border testing confirms sanctions screening and transaction monitoring."),
  });
  await expect(page.getByRole("button", { name: "Upload and extract evidence" })).toBeEnabled();
  await page.getByRole("button", { name: "Upload and extract evidence" }).click();
  await expect(page.locator(".toast")).toContainText("Text evidence uploaded");
  const evidence = page.locator(".evidence-provenance li").filter({ hasText: "Control test report" });
  await expect(evidence).toContainText("Jurisdictions: GB, US");
  await expect(evidence).toContainText("Sanctions screening, Transaction monitoring");
  await expect(evidence).toContainText("Content fingerprint (SHA-256)");
});