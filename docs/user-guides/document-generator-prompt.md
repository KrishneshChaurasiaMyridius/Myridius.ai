# Prompt for Generating Workbench Handover Documents

Copy the prompt below into your document-generation tool. Attach or paste `workbench-user-manual.md` as the source of truth. If the tool supports reference images, also provide approved screenshots of the current application. Do not provide real customer or production-case data in screenshots.

---

## Copy-Ready Prompt

You are an expert technical writer, enterprise UX documentation designer, and user-training specialist. Create a complete, handover-ready documentation package for the **Myridius.ai Risk Workbench** using the attached source manual as the sole authority for product behavior.

### Deliverables

Create:

1. One comprehensive user handbook as an editable Word document (`.docx`) and a matching accessible PDF.
2. Five concise but complete persona guides, one each for Product Owner, FCRM Analyst, Risk Committee Member, Internal Auditor, and Administrator. Provide each as its own editable DOCX and accessible PDF.
3. A Tango-style guided walkthrough script for each persona. Each walkthrough must be suitable for recording with a screenshot-based guide tool: one numbered action per card, a short action title, exact interface target text, a concise instruction, and the expected result. Provide these as a separate editable document and PDF.
4. A one-page workflow-at-a-glance sheet showing the case stages, handoffs, responsible persona, and human decision gates.

Use descriptive filenames such as `Myridius_Risk_Workbench_User_Handbook.docx`, `Myridius_Guide_Product_Owner.pdf`, and `Myridius_Tango_Walkthroughs.pdf`.

### Audience and outcome

The readers may be new to the platform and unfamiliar with financial-crime risk workflows. After reading their guide, a user must be able to sign in, confirm their role, navigate to the right case, perform every action currently available to that persona, recognize whether the action succeeded, understand the next handoff, and know when to stop and escalate.

Write for busy operational users. Be precise, calm, direct, and non-promotional. Expand necessary domain terms in plain language on first use. Use exact button, field, menu, status, and section labels from the source. Do not assume that all roles can see the same screens.

### Product facts that must remain accurate

- The workbench uses five personas: product owner, FCRM analyst, risk committee member, internal auditor, and administrator.
- Workflow states are Draft, Intake review, Analyst review, Committee decision, and Decided.
- Product owners create/revise their own drafts, record synthetic evidence, and submit the case. Creation and submission are separate actions.
- Analysts enter six risk-factor values (1-5) plus control effectiveness (0-4), run deterministic scoring, inspect the scoring result, prepare cited draft material, optionally record a rationale-backed override, and send a ready case to committee.
- The residual risk cannot be scored below 1. The assessment draft is not a risk decision or committee approval.
- Committee members make and document one of four human decisions: Approve, Reject, Defer, or Approve with conditions. Conditional approval requires a description, owner, due date, and verification criteria.
- Administrators register and retire source-linked policy excerpts. Committee members approve sources. Preserve this separation of duties.
- In OIDC mode, demonstration policy seed sources are excluded. Draft generation fails closed if there is no active, committee-approved, non-demo source matching `risk_based_approach` or `controls_and_governance`. Include the recovery: administrator registers a verified external excerpt; committee member approves it; analyst retries.
- The application is currently for synthetic data. Clearly warn users not to enter real customer, account, personal, confidential production, or live-case information.
- The evidence-upload panel accepts synthetic UTF-8 `.txt` and `.md` files from 1 to 20,000 bytes. The UI shows extracted jurisdiction, control, and risk-indicator cues separately from the SHA-256 integrity fingerprint. Explain that the extraction is deterministic keyword matching, not a full analysis or control-effectiveness conclusion.
- The active scoring configuration panel is read-only in the current web UI. Do not invent a configuration edit form.
- Analysts enter a case-specific verification evidence summary of at least 20 characters before selecting **Verify condition**.
- The auditor can review case events, verify evidence integrity, and download a decided case's evidence package. Do not claim there is an operations metrics dashboard in the UI.
- A source URL in an intake or evidence field is a reference; it does not upload or ingest the linked document.
- The full current feature/step descriptions and exact labels are in the attached manual. Prefer it whenever a brief fact list and a detailed instruction differ.

### Handbook structure

Build the main handbook with these sections:

1. Cover page with document title, revision date, intended audience, and a clear synthetic-data notice.
2. How to use this handbook and what the product does/does not do.
3. Sign-in, role verification, OIDC versus local demo mode, and safe sign-out.
4. Annotated workbench overview: sidebar, top bar, expandable workflow inbox directly below the header, short-lived action toasts, role panels, queue, active case, and audit timeline.
5. Role/authority matrix and separation-of-duties diagram.
6. Workflow lifecycle diagram from product-owner draft through committee decision and auditor review.
7. Complete step-by-step chapters for all five personas.
8. Shared tasks: find/filter a case, acknowledge a handoff, interpret statuses and audit timestamps.
9. Policy-source bootstrap and missing-source 409 recovery.
10. Error/recovery table with symptoms, meaning, next action, and escalation owner.
11. Role-specific readiness/completion checklists.
12. Glossary, support information to capture, known limitations, and document governance/version block.

### Persona guide requirements

Each persona guide must begin with a compact role card showing:

- What this role owns.
- What this role is authorized to do.
- What this role must not do.
- What information/evidence should be ready before starting.
- What success looks like and to whom the work is handed off next.

Then document each task as numbered, atomic steps. For every numbered step, include:

- **Action:** One click, field entry, or decision at a time.
- **Where:** Exact visible page section and control label.
- **Enter or inspect:** Specific content or quality criteria, including length/scale constraints when applicable.
- **Expected result:** Exact success message or state change where known.
- **Stop/escalate when:** Relevant 403/409, missing evidence/source, incorrect role, failed integrity, API outage, or other blocking condition.

Do not collapse a workflow into vague directions such as “complete the form” or “review the case.” Enumerate each relevant field or decision element. Keep explanations understandable without backend/API knowledge.

### Tango-style walkthrough requirements

For each persona, create a recording script with one card per screen/action. Use this card format:

**Card NN: [short action title]**

- **Screenshot target:** [the exact UI element or screen to capture]
- **On-screen instruction:** [one concise imperative sentence]
- **Narration/context:** [why the user is doing this; include important caution]
- **Expected result:** [visible confirmation or state]
- **Next card:** [next logical action]

Include screenshot placeholders only, for example `[Insert current screenshot: sidebar with analyst role selected]`. Do not fabricate UI screenshots, pretend a visual was supplied, or draw a control that is not in the current UI. If screenshots are supplied, use them only to illustrate controls that match the attached manual. Add alt text to every screenshot/diagram.

### Visual and accessibility direction

- Brand: Myridius.ai Risk Workbench.
- Style: restrained enterprise operations guide; clean white/light background, deep forest-green headings, charcoal body text, muted green callouts, amber caution blocks, high contrast.
- Use a clear sans-serif typeface, a readable 10.5-12 pt body size for print, consistent heading hierarchy, generous but efficient spacing, and page numbers.
- Use tables for role permissions, status meanings, and error recovery. Keep tables readable on standard letter/A4 pages; avoid tiny type.
- Use callouts for **Important**, **Expected result**, **Stop and escalate**, and **Known limitation**.
- Use diagrams only when they improve understanding. Flow diagrams must preserve the real sequence and handoff authorities. Never depict AI as deciding, approving, or advancing cases.
- Make the PDF searchable, tagged/accessibility-aware, with selectable text, proper heading structure, descriptive links, and meaningful image alt text. Do not rely on color alone to communicate status.
- Include a clickable table of contents in the handbook.

### Accuracy, safety, and editorial rules

- Treat the attached manual as the source of truth. Do not invent features, permissions, URLs, error behavior, contact details, service-level targets, legal advice, or organizational policy.
- Where an organization-specific value is absent (support email, production URL, policy owner, records repository, escalation group), use a conspicuous editable placeholder such as `[Organization to complete: support contact]`. Do not guess.
- Keep the exact technical values and limits from the manual. Do not round, reinterpret, or silently omit validation rules.
- Explain that a cited draft is an analyst aid and requires human review. Human committee members retain decision authority.
- Clearly distinguish product limitations from user mistakes. Do not suggest workarounds that bypass role checks, policy-source approval, or audit controls.
- Do not instruct users to use browser developer tools, direct database access, another person's account, or API calls to bypass the UI or role permissions.
- Do not include secrets, user tokens, personal customer data, real case information, or unverified policy text.
- Run a final consistency review against the attached manual. Include a short “Document verification” note listing the source-manual revision date and identifying any placeholders that the organization must fill before distribution.

### Final quality check

Before delivery, verify that:

1. All five personas have distinct, complete guides.
2. Every task has atomic numbered instructions and expected outcomes.
3. Case-state transitions and handoffs are accurate.
4. Role boundaries and human decision gates are never contradicted.
5. The missing-policy-source recovery is correct for OIDC mode.
6. The supported text upload limits and deterministic extraction scope are disclosed, and analysts are instructed to enter condition-specific verification evidence.
7. There are no fabricated screenshots, product controls, policy claims, support contacts, or URLs.
8. The generated DOCX and PDF filenames are descriptive and consistent.

Now generate the complete documentation package from the attached source manual.

---

## Recommended Inputs Before Generation

Attach these files/images to the generator:

- `docs/user-guides/workbench-user-manual.md` as the authoritative text.
- Current screenshots captured from the deployed version for each persona, if available.
- Approved logo/brand assets, if the organization has them.
- The support contact, production URL, policy-owner contact, escalation route, and evidence-retention location to replace the explicit placeholders.

Capture screenshots using synthetic/demo records only. The local demo identity selector can be used to capture each persona view; do not include real data or access tokens in screenshots.