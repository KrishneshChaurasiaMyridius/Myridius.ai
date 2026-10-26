# Myridius.ai Risk Workbench User Manual

**Audience:** Product owners, FCRM analysts, risk committee members, internal auditors, and administrators.
**Revision date:** 26 October 2026. **Purpose:** Practical handover guide for using the current Myridius.ai Risk Workbench.

## 1. Read This First

The workbench organizes a financial-crime risk review from intake through human committee decision. The system validates information, calculates risk using deterministic rules, prepares cited assessment material, and records activity in an audit trail. It does not approve, reject, or decide a case automatically.

**Data boundary:** This release is configured for synthetic demonstration data. Do not enter real customer data, account details, personal data, confidential production information, or live case evidence. A source URL entered as evidence is a reference only; it does not upload or ingest the linked file.

**Environment boundary:** The menu and buttons available to a user depend on their assigned role. In OIDC/production mode, the role comes from the authenticated account and cannot be changed in the workbench. The demo identity selector is for local demonstrations only.

## 2. Sign In and Identify Your Role

### OIDC sign-in

1. Open the workbench URL provided by your organization. The current demo deployment is `https://myridius-ai-ye2b-one.vercel.app`; use the organization-approved URL for operational work.
2. Select **Sign in** and complete the identity provider sign-in.
3. Wait for the workbench to validate your identity. The lower-left account area shows the role and display name returned by the API.
4. Confirm the displayed role is the role you expect before opening or acting on a case.
5. Use **Sign out** in the top bar when you finish, especially on a shared device.

If the workbench reports that identity cannot be validated, do not try to use another person's account or a demo identity. Contact the workbench administrator and provide your sign-in time, displayed error, and the role you were assigned. Never send a password, access token, or browser authorization header to support.

### Local demo identity selector

In demo mode, **Acting as** appears at the bottom of the sidebar. Selecting another identity changes the UI persona and the demo actor header used for subsequent actions. This is only for testing separation of duties in the local demo. It is not a way to gain permissions in OIDC mode.

## 3. Understand the Workbench Screen

The screen is organized as follows:

1. **Left sidebar:** Role-specific links, case and inbox counts, and (in demo mode) the identity selector.
2. **Top bar:** Current section, active case identifier when selected, environment indicator, sign-out control in OIDC mode, and a **New intake** shortcut for product owners.
3. **Workflow inbox:** Expandable role-scoped handoffs directly below the top bar. Unread items can be opened and acknowledged.
4. **Action notifications:** Short-lived toasts appear near the upper-right corner for success and error feedback. Dismiss them with the close button; they also disappear automatically.
5. **Role tools:** Depending on your role, panels for intake, scoring configuration, or policy-source governance appear above the case workspace.
6. **Case queue:** Search cases by identifier, title, or change type; filter by workflow status; select a case to load it.
7. **Case workspace:** Summary, residual risk, workflow progress, review material, role-specific actions, and the audit timeline.

### Workflow statuses

| Status shown in the queue | Meaning | Normal next action |
| --- | --- | --- |
| Draft | Product owner is preparing the intake and evidence. | Save/revise the draft, add evidence, then submit for intake review. |
| Intake review | Case is waiting for an analyst assessment. | Analyst enters factor scores and runs the risk assessment. |
| Analyst review | Deterministic scores are available for analyst review. | Analyst reviews the result, prepares cited material, optionally records an override, then sends the case to committee. |
| Committee decision | Case is waiting for a committee member. | Committee member records a decision and rationale. |
| Decided | A committee decision has been recorded. | Review the decision, any conditions, and the audit record; an analyst may verify open conditions. |

The workflow indicator is a visual summary. The status and available actions are authoritative. A button may not be available if the case is not at the required stage or your role does not have authority.

## 4. Role and Authority Guide

| Persona | Main tasks | May not |
| --- | --- | --- |
| Product owner | Create and revise own draft intake, record synthetic evidence, submit the case, review the case record. | Run the analyst risk assessment or make a committee decision. |
| FCRM analyst | Assess risk, review scoring details, prepare cited draft, document an override and rationale, send to committee, verify an open committee condition. | Record the committee decision. |
| Risk committee member | Review the decision pack and citations; approve, reject, defer, or approve with conditions. | Register or retire policy sources; those actions belong to an administrator. |
| Internal auditor | Review cases and audit events, check evidence integrity, download an evidence package for a decided case. | Change intake, scores, policy sources, or committee decisions. |
| Administrator | Register source-linked policy revisions and retire approved sources; view the active scoring configuration. | Approve a source or make a committee decision. |

All users should follow least privilege. Do not ask another persona to perform an action using your account. The API enforces role permissions even if a screen or link is visible.

## 5. Product Owner: Create, Evidence, and Submit

### Create a new case

1. Confirm the sidebar identifies you as **product owner**.
2. Select **New intake** in the sidebar or top bar. The intake form is also visible on the main page.
3. Complete each field:
   - **Change title:** Use a concise, unique description. Minimum 8 characters; maximum 160.
   - **Change type:** Choose Product, Product feature, Process, Vendor, Geography, or Customer segment.
   - **Business owner:** In OIDC mode this is filled from your verified identity. In demo mode select/use the correct demo owner.
   - **Target launch:** Enter the planned launch date and time.
   - **Customer exposure:** Choose Low, Moderate, or High based on the expected customer impact.
   - **Jurisdictions:** Enter one or more country/territory identifiers, separated by commas.
   - **Delivery channels:** Enter channels such as web, mobile, branch, or API, separated by commas.
   - **Payment characteristics:** Describe the payment types or flows, currencies, speed, and cross-border features relevant to the change.
   - **Third parties:** List involved vendors or external parties. At least one is required for a Vendor change.
   - **Proposed controls:** List relevant safeguards, separated by commas.
   - **Attachment URLs:** Optional web URL references to supporting material. This field records a URL; it does not upload the document.
   - **Business rationale:** Explain the need, expected benefit, affected customers, and material operational or risk changes. Minimum 20 characters; maximum 2,000.
4. Use the **i** control beside a field label for a description of why the information is collected and how reviewers use it.
5. Select **Create intake**.
6. Wait for the toast **Intake created. Product owner submission is now required.** The created case should be selected in the workspace and appear in the queue with status **draft**.

Creating the intake does not submit it. The case remains a draft until you explicitly submit it.

### Record structured evidence

1. With your draft case selected, go to **DOCUMENT EVIDENCE** in the human-action panel.
2. Enter **Document title** (minimum 5 characters) and **Document type** (minimum 3 characters).
3. Optionally enter a source URL.
4. Paste synthetic supporting text into **Document text** (minimum 20 characters; maximum 20,000).
5. Select **Record and extract evidence**.
6. Confirm the success toast. The evidence appears in **Recorded evidence** with extracted jurisdictions, control names, risk indicators, and a separate server-calculated SHA-256 fingerprint and byte count.

The system extracts simple jurisdictions, controls, and risk indicators from text. Extraction is a convenience for review, not proof that a control is effective. A person must check the original evidence and interpretation.

### Submit the case

1. Review the intake fields and evidence for accuracy.
2. Select **Submit for intake review** beside **Record and extract evidence**.
3. Confirm the toast **Case submitted for intake review.**
4. The case moves to **intake review** and a handoff notification is created for the analyst role.

### Revise a draft

1. Select your draft in the case queue.
2. Update the intake fields and select **Save draft revision**.
3. Confirm the version number increases and the status remains **draft**.
4. Add or correct evidence as needed, then submit when ready.

Submitted cases are not editable through the product-owner intake form. Contact the analyst or workbench administrator if a submitted case needs correction.

### Text-file upload

The workbench accepts synthetic UTF-8 `.txt` and `.md` files from 1 to 20,000 bytes. It extracts supported jurisdiction, control, and risk-indicator cues using deterministic keyword matching. This is not a full document analysis and does not prove a control is effective. The SHA-256 fingerprint is separate: it supports integrity checks and is not the extracted content. PDF, image, OCR, and arbitrary binary-file processing are not supported.

## 6. FCRM Analyst: Assess and Prepare a Recommendation

### Open and acknowledge a handoff

1. Confirm the sidebar role is **analyst**.
2. Expand **Workflow inbox** and find the notification for the case. Notifications are role-scoped.
3. Select **Open and acknowledge**. The workbench loads the case, scrolls to the workspace, marks the notification read, and displays a confirmation message.
4. Alternatively, search the case queue by case identifier or title and select the case with status **intake review**.
5. Review the intake summary, jurisdictions, proposed controls, and any evidence before scoring.

### Run deterministic risk assessment

1. In **ANALYST RISK INPUTS**, enter a score from 1 to 5 for each factor: Customer, Product, Channel, Geography, Transaction, and Third party.
2. Enter **Control effectiveness** from 0 to 4. Score based on substantiated control design/evidence, not on the mere presence of a proposed control name.
3. Select **Run risk assessment**.
4. Confirm the status changes to **analyst review** and the result appears under **How the score was calculated**.
5. Review each factor score, its weight, the saved configuration version, control-effectiveness value, inherent risk, residual risk, and rating.

The API calculates the score deterministically from the active configuration and saves a configuration snapshot with the assessment. Controls cannot reduce residual risk below 1. The displayed number is an input to human review, not an approval recommendation by itself.

### Prepare the cited assessment draft

1. Review the active scoring configuration panel and the case’s evidence first.
2. Select **Prepare cited draft**.
3. If it succeeds, read the generated summary, factor analysis, control observations, evidence gaps, analyst questions, and **Approved source excerpts**. Expand **Generation context and provenance** when needed to inspect retrieval and execution metadata.
4. Check whether evidence references correspond to the intended documents and whether the explanations are supported. Correct the analysis or record an override if needed.

Draft generation is not a decision and does not advance the case out of **analyst review**. It is a review artifact. Provider output can be unavailable or fail validation; the case remains in analyst review when that happens.

**Production policy-source prerequisite:** In OIDC mode, demo seed sources are excluded. A draft requires at least one active, committee-approved, non-demo policy source matching `risk_based_approach` or `controls_and_governance`. If you see a 409 message saying no approved source matched, do not retry repeatedly or use demo citations. Ask an administrator to register an externally sourced policy excerpt and a committee member to approve it; then retry.

### Record an analyst override

1. In **ANALYST OVERRIDE**, enter a residual-risk value from 1 to 5.
2. Enter a rationale of at least 20 characters. Explain the evidence and reasoning for changing the score; do not use the override to bypass missing evidence or policy sources.
3. Select **Record override** and confirm the success message and updated residual-risk display.
4. The prior value and rationale are retained in the case history/audit data.

An override records an analyst judgment. It does not record a committee outcome.

### Send to committee

1. Ensure the risk assessment and any required draft review/override are complete.
2. Select **Send to committee**.
3. Confirm the case moves to **committee decision** and the success toast confirms the handoff.
4. The committee member receives a workflow-inbox notification.

Use this action only after the case is decision-ready. If a required policy source is missing or evidence remains incomplete, follow your escalation procedure before handing it off.

### Verify an approved condition

1. Open a case with status **decided** and an **open** condition.
2. Inspect the condition, owner, due date, and verification criteria. Independently examine the supporting evidence before recording verification.
3. Enter a verification evidence summary of at least 20 characters, explaining what you reviewed and how it meets the criteria.
4. Select **Verify condition** only when the criteria have been met.
5. Confirm the condition shows verified and the audit timeline includes the verification event.

## 7. Risk Committee Member: Review and Decide

1. Confirm the sidebar role is **committee member**.
2. Expand **Workflow inbox** and locate the **sent to committee** handoff; select **Open and acknowledge**. Or search the queue for a case with status **committee decision**.
3. Review the case summary, residual risk, factor breakdown, evidence records, proposed controls, and citations. Open source links when present and confirm their scope, version, and effective status.
4. Read the analyst’s recommendation, assessment draft, evidence gaps, questions, and any override rationale. Ask the analyst for clarification before deciding if material issues remain.
5. In **COMMITTEE DECISION**, choose one outcome: **Approve**, **Reject**, **Defer**, or **Approve with conditions**.
6. Enter **Decision rationale** (minimum 20 characters). Record the basis for the decision, including relevant evidence and unresolved risk.
7. For **Approve with conditions**, complete:
   - **Condition description** (minimum 10 characters)
   - **Condition owner** (minimum 3 characters)
   - **Due date**
   - **Verification criteria** (minimum 10 characters; maximum 1,000)
8. Select **Record committee decision** once. Wait for the confirmation message and status **decided**.
9. Review the recorded outcome and any conditions. The audit timeline records who acted and when.

The committee is the decision authority. Do not ask the system or AI draft to make the decision for you. A decision cannot be changed by editing the original intake; follow the organization's formal reconsideration or correction process.

## 8. Internal Auditor: Inspect and Export Evidence

1. Sign in with the **auditor** role and verify the name/role in the sidebar.
2. Search or filter the queue to find a case. Select it to load its summary and audit timeline.
3. Review the chronological audit events, actor names, timestamps, decision material, and recorded evidence.
4. In **Recorded evidence**, select **Verify integrity** for a document record. Confirm **Integrity verified**. A failed integrity check is a stop-and-escalate issue; do not rely on the affected document.
5. For a case with status **decided**, select **Download evidence package** in the decision panel.
6. Save the generated JSON file to the approved audit location. Protect it according to organizational evidence-retention and access rules; it contains case and audit information.
7. Confirm the export action is recorded in the audit trail and that the package’s audit verification is valid using the organization's approved review process.

The auditor view is read-only for workflow decisions. The workbench currently does not expose the operations metrics dashboard in the UI; operational metrics require a separately authorized tool/API process.

## 9. Administrator: Govern Policy Sources

The administrator maintains source records but does not approve them. Committee approval is a separate person/role gate.

### Register a new externally sourced policy excerpt

1. Confirm the sidebar role is **administrator**.
2. Open **Policy sources**.
3. Before registering anything, obtain the authoritative source and excerpt through your organization's policy/regulatory owner. Confirm the exact source wording, scope, version, publication/effective date, and URL. Do not invent requirements or copy an unverified summary as policy text.
4. In the registration form, enter:
   - **Source ID:** Unique uppercase letters, numbers, and hyphens; 4–80 characters.
   - **Topic:** Use a matching retrieval topic: `risk_based_approach` or `controls_and_governance` for the current assessment flow.
   - **Title:** At least 10 characters; use a precise source/excerpt title.
   - **Source URL:** Required for non-demo, real policy material.
   - **Policy excerpt:** At least 20 characters and no more than 2,000. Preserve sufficient surrounding context to interpret the excerpt accurately.
   - **Revision of:** Leave as **New source (version 1)** for a new source. Choose an active approved source only when creating a successor revision.
   - **Version:** Starts at 1 for a new source; calculated when revising a source.
5. Select **Register source for review**. The new source is pending and cannot be cited yet.
6. Notify a committee member that the source is awaiting review. Keep source provenance and approval evidence according to policy.

### Register a revision

1. Select the approved active source in **Revision of**.
2. Confirm the version increments by one and the topic/provenance class remain consistent.
3. Update the title, URL, and excerpt to match the authoritative revision.
4. Register it for committee review. The prior approved version remains active until the successor is approved.
5. After committee approval, confirm the new source is approved and the predecessor is marked superseded/retired.

### Retire a source

1. Locate the approved source in the policy list.
2. Select **Retire** only after the policy owner confirms it is no longer current or appropriate.
3. Confirm it is marked retired and is not used in future retrieval.

**Separation of duties:** Administrators register and retire. Committee members approve. Do not use a second identity or ask another user to share credentials to bypass this separation.

### Scoring configuration panel

The **Active scoring configuration** panel is a read-only summary in the current UI. It shows the version, factor weights, residual-risk floor, rating bands, control mitigation divisor, and update attribution. Although the service supports an administrator configuration API, the workbench does not currently provide an edit form. Do not attempt configuration changes through browser developer tools. Use the approved deployment/change-management process or contact the system owner.

## 10. Shared Review and Navigation Tasks

### Find a case

1. Select **Cases** in the sidebar.
2. Enter a case ID, part of the title, or change type in **Search case queue**.
3. Optionally choose a workflow state from **Filter by status**.
4. Select the matching row. The detail panel and audit timeline load for that case.
5. Clear the search and restore **All statuses** to return to the full queue.

### Use the workflow inbox

1. Expand **Workflow inbox** directly below the page header.
2. Review notification action, message, and case ID.
3. Select **Open and acknowledge** for an unread item you are responsible for.
4. Confirm the selected case opens and the notification is marked acknowledged.

Acknowledging a notification confirms that the handoff was seen; it does not itself perform the next workflow action.

### Review audit timestamps

Each case audit entry shows the action, actor, and local-time display of the event timestamp. The underlying event time is stored as a timestamp. Use the case ID and timestamp when discussing a specific action with support.

## 11. Common Errors and What to Do

| Message or behavior | Meaning | Recommended next step |
| --- | --- | --- |
| No approved policy source matched the assessment (HTTP 409) | No eligible active source matches the assessment topics. In OIDC mode, demo sources are excluded. | Administrator registers a real source with a matching topic; committee approves; analyst retries. Do not use a demo source in production. |
| Anthropic provider error (HTTP 503) | The API could not generate or validate the draft. Anthropic HTTP status errors are returned as sanitized categories; raw provider messages are not exposed. | Check the category and Request ID in the error toast or the failed AI execution record. For 401/403, verify the server-side key and workspace/model permissions; for 404, verify `ANTHROPIC_MODEL`; for 429, check usage limits; for timeout/connectivity, check outbound access and provider status. Correlate the Request ID with API logs. The case remains in analyst review. |
| Only assessed cases in analyst review can receive a draft | The case is at the wrong status or no risk assessment exists. | Confirm status is **analyst review** and scoring completed; reload the case. |
| Actor is not authorised (HTTP 403) | Your role cannot perform that action. | Confirm the signed-in role and hand the task to its authorized persona. Do not switch accounts in production. |
| Product owner may only submit/update their own cases | The case owner does not match the signed-in identity. | Confirm the active product-owner identity and contact an administrator if ownership is incorrect. |
| API unavailable / identity service unavailable | The web client cannot reach the API or the service is unhealthy. | Refresh once; if it persists, notify support with the URL, timestamp, case ID (if known), and request ID. |
| Policy source registration rejected | A required field, URL, topic, identifier, or revision relationship is invalid. | Verify the source URL, unique ID, required lengths, matching topic, and version/predecessor rules. |
| Upload rejected | The file may be empty, over 20,000 bytes, not `.txt`/`.md`, non-UTF-8, or not synthetic. | Choose a supported UTF-8 text file within the size limit. |
| Evidence integrity failed | Stored content differs from its recorded fingerprint or verification could not establish integrity. | Stop relying on the evidence and escalate as an evidence-integrity incident. |

When contacting support, include the environment, persona, case ID, exact message, approximate time and timezone, and `X-Request-Id` from the failed API response if available. Never include passwords, access tokens, or sensitive real case data.

## 12. End-to-End Completion Checklist

### Product owner

- [ ] Correct persona and business owner are shown.
- [ ] Required intake fields are complete and understandable.
- [ ] Vendor changes identify at least one third party.
- [ ] Evidence is synthetic, relevant, and recorded before submission where possible.
- [ ] Case is explicitly submitted and shows **intake review**.

### Analyst

- [ ] Correct case and handoff are acknowledged.
- [ ] All six factor scores and control effectiveness are evidence-based.
- [ ] Saved configuration version and calculated outputs were reviewed.
- [ ] Draft citations are approved and relevant, or missing-source escalation is resolved.
- [ ] Any override has a clear rationale.
- [ ] Case is sent to committee only when decision-ready.

### Committee member

- [ ] Intake, evidence, score, draft, citations, questions, and gaps were reviewed.
- [ ] Decision rationale explains the outcome.
- [ ] Any condition has an owner, due date, and testable verification criteria.
- [ ] Decision is recorded once and appears in the audit trail.

### Auditor

- [ ] Audit chronology and actor attribution were reviewed.
- [ ] Evidence integrity checks were completed as required.
- [ ] Evidence package was downloaded to an approved location.
- [ ] Any integrity or audit anomaly was escalated.

### Administrator

- [ ] Source provenance and excerpt were verified with the policy owner.
- [ ] Source topic, version, and status are correct.
- [ ] Committee approval was completed by a committee member.
- [ ] Superseded or retired sources are no longer active.

## 13. Glossary

- **Case:** A versioned product or material-change assessment moving through workflow stages.
- **Evidence record:** Synthetic text attached to a case, with extraction metadata and a server-calculated hash.
- **Inherent risk:** Risk before the assessed effect of controls.
- **Residual risk:** Risk remaining after the deterministic control-mitigation calculation; it cannot be less than 1.
- **Assessment draft:** Cited analyst-review material. It is not a decision or approval.
- **Policy source:** A source-linked excerpt registered by an administrator and approved by a committee member before eligible use.
- **Workflow inbox:** Role-scoped handoff notifications; acknowledgement is distinct from completing the next action.
- **Audit trail:** Timestamped, actor-attributed events linked to the case. Material actions are retained for traceability.

## 14. Product Owner Handover Notes

Before distributing this manual, the workbench owner should confirm the approved production URL, support contact, policy owner, escalation route, document-retention location, and whether text upload has been enabled. The current UI does not expose a scoring-configuration editor or operations metrics dashboard. Update this guide whenever button labels, permissions, or workflow states change.