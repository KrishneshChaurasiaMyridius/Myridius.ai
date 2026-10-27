import { expect, test, type Page } from "@playwright/test";

async function fillIntake(page: Page, title: string) {
  const form = page.locator("#product-intake");
  await form.locator("input").nth(0).fill(title);
  await form.locator("select").nth(0).selectOption("product_feature");
  await form.locator("input").nth(1).fill("Synthetic Demo Owner");
  await form.locator("input").nth(2).fill("2027-03-31T12:00");
  await form.locator("select").nth(1).selectOption("moderate");
  await form.locator("input").nth(3).fill("GB, US");
  await form.locator("input").nth(4).fill("web, api");
  await form.locator("input").nth(5).fill("synthetic cross-border business payments");
  await form.locator("input").nth(6).fill("Synthetic Example Processor");
  await form.locator("input").nth(7).fill("Sanctions screening, transaction monitoring");
  await form.locator("textarea").fill("Synthetic test intake for validating the role-based workflow and review handoff.");
}

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
  await expect(page.locator("#product-intake input").first()).toHaveValue("");
  await expect(page.locator("#product-intake textarea")).toHaveValue("");
  await expect(page.locator("#product-intake select").nth(0)).toHaveValue("");
  await expect(page.locator("#product-intake select").nth(1)).toHaveValue("");
  await fillIntake(page, "Browser workflow case");
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
  await fillIntake(page, "Analyst review workflow case");
  await page.getByRole("button", { name: "Create intake" }).click();
  await page.locator("#evidence-upload input[type='file']").setInputFiles({
    name: "review-evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic evidence for the analyst and committee review. GB and US cross-border scope; Sanctions screening; Transaction monitoring; Customer due diligence."),
  });
  await page.getByRole("button", { name: "Upload and extract evidence" }).click();
  await expect(page.locator(".toast")).toContainText("Text evidence uploaded");
  await page.locator(".draft-actions").getByRole("button", { name: "Submit for intake review" }).click();
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
  await expect(page.locator(".decision-pack")).toContainText("Business rationale");
  await expect(page.locator(".decision-pack")).toContainText("Synthetic test intake for validating the role-based workflow and review handoff.");
  await expect(page.locator(".decision-pack")).toContainText("Synthetic Example Processor");
  const reviewerEvidence = page.locator(".decision-evidence-list li");
  await expect(reviewerEvidence).toContainText("review-evidence.txt");
  await expect(reviewerEvidence.getByRole("link", { name: "Download evidence file" })).toHaveAttribute("download", "review-evidence.txt");
  await reviewerEvidence.getByText("Read evidence text").click();
  await expect(reviewerEvidence.locator("pre")).toContainText("Synthetic evidence for the analyst and committee review.");
  await expect(page.locator(".risk-inputs input")).toHaveCount(7);
  await expect(page.locator(".risk-inputs .field-tip")).toHaveCount(7);
  await page.getByLabel("Scoring guidance for customer risk").click();
  await expect(page.getByRole("tooltip")).toContainText("customer types and segments in scope");
  for (const input of await page.locator(".risk-inputs input").all()) {
    await expect(input).toHaveValue("");
  }
  for (const [index, score] of ["4", "5", "3", "4", "5", "3", "2"].entries()) {
    await page.locator(".risk-inputs input").nth(index).fill(score);
  }
  await page.getByRole("button", { name: "Run risk assessment" }).click();
  await expect(page.getByRole("heading", { name: "Analyst recommendation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How the score was calculated" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare cited draft" }).click();

  await expect(page.getByRole("heading", { name: "Risk factor analysis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Control observations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intake and evidence discrepancies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Potential risk signals to verify" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Suggested analyst research steps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence gaps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved source excerpts" })).toBeVisible();
  await expect(page.getByText("DEMO SAMPLE · NOT AUTHORITATIVE").first()).toBeVisible();
  await expect(page.locator(".draft-purpose")).toContainText("cannot decide or approve the case");
  await page.getByRole("button", { name: "Send to committee" }).click();
  await expect(page.locator(".toast")).toContainText("Case sent to committee.");
  await page.getByLabel("Acting as").selectOption("committee");
  const committeeHandoff = page.locator(".inbox li").filter({ hasText: "Analyst review workflow case" });
  await committeeHandoff.getByRole("button", { name: "Open and acknowledge" }).click();
  await expect(page.locator(".decision-pack")).toContainText("Payment characteristics");
  await expect(page.locator(".decision-pack")).toContainText("synthetic cross-border business payments");
  await expect(page.locator(".decision-evidence-list li")).toContainText("review-evidence.txt");
  await expect(page.locator(".decision-evidence-list pre")).toContainText("Synthetic evidence for the analyst and committee review.");
  await expect(page.locator(".draft")).toContainText("ASSESSMENT DRAFT · human only");
  await expect(page.locator(".draft")).toContainText("Generated by: deterministic-mock-v1");
  await expect(page.locator(".draft")).toContainText("Approved source excerpts");
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
  await expect(page.getByText("Sample policy entries are for demonstration only", { exact: false })).toHaveCount(0);

  await page.getByLabel("Source ID").fill(firstSourceId);
  await page.getByLabel("Topic").fill("risk_based_approach");
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
  await fillIntake(page, "Evidence upload workflow case");
  await page.getByRole("button", { name: "Create intake" }).click();
  await expect(page.locator(".toast")).toContainText("Intake created.");
  await page.getByLabel("Document title").fill("Synthetic control test report");
  await page.getByLabel("Document type").fill("control_test");
  await page.locator('#evidence-upload input[type="file"]').setInputFiles({
    name: "synthetic-controls.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Synthetic GB and US cross-border testing confirms sanctions screening and transaction monitoring."),
  });
  await expect(page.getByRole("button", { name: "Upload and extract evidence" })).toBeEnabled();
  await page.getByRole("button", { name: "Upload and extract evidence" }).click();
  await expect(page.locator(".toast")).toContainText("Text evidence uploaded");
  const evidence = page.locator(".evidence-provenance li").filter({ hasText: "Synthetic control test report" });
  await expect(evidence).toContainText("Jurisdictions: GB, US");
  await expect(evidence).toContainText("Sanctions screening, Transaction monitoring");
  await expect(evidence).toContainText("Content fingerprint (SHA-256)");
});