# Risk Assessment Workbench

A synthetic-data-only Financial Crimes Risk Management (FCRM) workbench for assessing new products and material changes.

## MVP

The first end-to-end slice supports a synthetic change request from product-owner intake through an analyst review and a human committee decision. AI assistance is represented by a deterministic adapter so that results are reproducible and never decide an outcome.

## Current demo flow

1. Create a synthetic product-change intake.
2. Submit it from draft to intake review.
3. Run deterministic scoring with a residual-risk floor of one.
4. Prepare a cited, human-only assessment draft.
5. Record an analyst override, then send the case to committee.
6. Record a human committee decision with a required condition.
7. Review the hash-linked audit timeline and call the audit-verification endpoint.

## Local development

1. Copy `.env.example` to `.env` and set only local, synthetic-data configuration.
2. Run `docker compose up --build` to start the API, workbench and PostgreSQL. The API uses PostgreSQL whenever `DATABASE_URL` is set.
3. For a no-Docker API demo, run `C:\Python313\python.exe -m uvicorn app.main:app --reload --port 8000` from `apps/api`.
4. The API is available at `http://localhost:8000/health` and API documentation at `http://localhost:8000/docs`.

The no-Docker API uses `raw.db`, a SQLite demo database with append-only audit events. It is excluded from source control. Container deployments use PostgreSQL through `DATABASE_URL`; the API container runs `alembic upgrade head` before it accepts traffic. Run the same command manually from `apps/api` after setting `DATABASE_URL` for controlled deployments.

For an internet-facing production deployment, use HTTPS, private managed PostgreSQL, `AUTH_MODE=oidc`, exact production `CORS_ALLOWED_ORIGINS`, and platform readiness checks against `/ready`. The complete operator checklist is in [ops/runbook.md](ops/runbook.md).

## Identity modes

`AUTH_MODE=demo` on the API and `NEXT_PUBLIC_AUTH_MODE=demo` on the workbench expose synthetic identities for local role-based workflow demonstrations. Product owners create and submit their own cases; analysts assess, draft, override and verify conditions; committee members decide; auditors export evidence; administrators activate a new risk configuration. Demo mode remains the frontend default for local development.

`NEXT_PUBLIC_AUTH_MODE=oidc` enables Auth0 authorization-code login with PKCE. Set `NEXT_PUBLIC_AUTH0_DOMAIN`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, `NEXT_PUBLIC_AUTH0_AUDIENCE` (the Auth0 API Identifier), and `NEXT_PUBLIC_API_URL` in Vercel. The browser sends the Auth0 API access token as a bearer token for every actor-protected request, including uploads and evidence export. The frontend fails closed when OIDC is selected but required public configuration is missing; it does not expose the demo actor selector.

The API validates the **access token**, so the claims must be added to that token (adding them only to the ID token is not sufficient). Assign each user exactly one of the allowed Auth0 application roles. In Auth0, create a **Post Login** Action with this logic, then **Deploy** it and attach it to the **Login** flow:

```javascript
exports.onExecutePostLogin = async (event, api) => {
	const namespace = "https://myridius.ai/claims";
	const allowedRoles = [
		"product_owner",
		"analyst",
		"committee_member",
		"auditor",
		"administrator",
	];

	const assignedRoles = (event.authorization?.roles ?? [])
		.filter((role) => allowedRoles.includes(role));

	if (assignedRoles.length !== 1) {
		api.access.deny("Assign exactly one application role before signing in.");
		return;
	}

	const user = event.user;
	const verifiedEmail = user.email_verified === true ? user.email : undefined;
	const candidates = [user.name, user.nickname, verifiedEmail];
	const displayName = candidates.find((value) =>
		typeof value === "string" &&
		value.trim() !== "" &&
		value.trim() !== user.user_id &&
		!value.trim().startsWith("auth0|")
	)?.trim();

	if (!displayName) {
		api.access.deny("Add a human-readable name or verified email to your Auth0 profile before signing in.");
		return;
	}

	const roleClaim = `${namespace}/fcrm_role`;
	const displayNameClaim = `${namespace}/display_name`;
	const role = assignedRoles[0];

	api.accessToken.setCustomClaim(roleClaim, role);
	api.accessToken.setCustomClaim(displayNameClaim, displayName);
	api.idToken.setCustomClaim(roleClaim, role);
	api.idToken.setCustomClaim(displayNameClaim, displayName);

	if (user.email) {
		api.accessToken.setCustomClaim(`${namespace}/email`, user.email);
		api.accessToken.setCustomClaim(`${namespace}/email_verified`, user.email_verified === true);
	}
};
```

Then check that `NEXT_PUBLIC_AUTH0_AUDIENCE` in Vercel and `OIDC_AUDIENCE` on the API are the same Auth0 API Identifier, and that the API uses the matching issuer and signing keys. Once the Action is deployed and attached, sign out of the workbench and sign in again to obtain a fresh access token. If identity still fails, verify that the token returned for the configured audience contains both namespaced claims; do not paste live tokens into tickets or public JWT inspection sites. The workbench calls `/api/v1/identity/me` and uses that API-validated profile as the signed-in identity and intake attribution. On Render set `AUTH_MODE=oidc`, `OIDC_ISSUER` to the Auth0 issuer URL, `OIDC_AUDIENCE` to the same API Identifier, `OIDC_JWKS_URL` to `https://<auth0-domain>/.well-known/jwks.json`, and `OIDC_ROLE_CLAIM=https://myridius.ai/claims/fcrm_role`. Also set `CORS_ALLOWED_ORIGINS` to the exact Vercel origin without a trailing slash. Never put an Auth0 client secret in the browser or repository.

For the current deployment, register `https://myridius-ai-ye2b-one.vercel.app` and `http://localhost:3000` as Auth0 Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins. Deploy and verify the OIDC-enabled frontend before switching the Render API from demo mode; the API will reject demo headers once OIDC mode is active.

## Quality gates

GitHub Actions runs SQLite and PostgreSQL Alembic migration smoke checks, PostgreSQL `CaseStore` initialization, the API workflow test suite, Python dependency audit, web type check, high-severity npm audit, and a Chromium Playwright smoke test that creates a synthetic case through the live workbench on pushes and pull requests.

### Prepare a live Claude demo

Use a local demo API with the Anthropic key configured only in its server environment. In the API PowerShell terminal, set:

```powershell
Set-Location apps/api
$env:AUTH_MODE = "demo"
$env:AI_ADAPTER = "anthropic-claude"
$env:ANTHROPIC_API_KEY = "<your Anthropic API key>"
C:\Python313\python.exe -m uvicorn app.main:app --reload --port 8000
```

Do not add the key to `NEXT_PUBLIC_*`, the web app, source control, or a browser request. In a second terminal, start the web app:

```powershell
Set-Location apps/web
npm.cmd run dev
```

From the repository root, create a sample draft and upload its synthetic evidence into the running API:

```powershell
C:\Python313\python.exe evals\load_sample_case.py
```

The script prints the new case ID. In the workbench, select that case, submit the intake, switch to the analyst persona, run the deterministic risk assessment, and select **Prepare cited draft**. Confirm the draft says `anthropic-claude` and review its advisory factor ratings, GB/US and web/API discrepancies, risk signals, analyst research steps, and citations. The synthetic report intentionally documents only GB web screening and omits US/API, third-party access controls, and monitoring effectiveness. The draft should help the analyst investigate these gaps; it is not a finding of misconduct or a committee decision. Demo policy citations are synthetic and non-authoritative.

For an automated end-to-end check that requires a real Claude call, run from the repository root with the same API key set in that terminal:

```powershell
$env:ANTHROPIC_API_KEY = "<your Anthropic API key>"
C:\Python313\python.exe evals\run_workflow_evaluation.py --require-claude
```

`--require-claude` fails when the key is absent or the response did not come from the Anthropic provider. Without that option, the evaluator auto-selects Claude when a key is present and otherwise uses the deterministic mock. This automated evaluator uses an isolated temporary database; use `load_sample_case.py` for a case that appears in the running workbench.

## AI adapter boundary

`AI_ADAPTER=deterministic-mock-v1` remains the reproducible local adapter. To enable Claude, set `AI_ADAPTER=anthropic-claude` and provide `ANTHROPIC_API_KEY` through the deployment secret manager; `ANTHROPIC_MODEL` defaults to `claude-opus-4-8`, `ANTHROPIC_MAX_TOKENS` defaults to 2048 (bounded to 256-4096), and `ANTHROPIC_TIMEOUT_SECONDS` is bounded to 1-120. In the workbench, after the product owner submits an intake and an analyst runs the deterministic assessment, **Prepare cited draft** invokes the configured provider. With Claude enabled, the v3 prompt sends the intake, deterministic scores and scoring configuration, up to 24,000 characters of uploaded/recorded evidence context, and eligible approved policy excerpts. Claude returns factor explanations and separate advisory factor ratings, possible intake/evidence discrepancies, risk signals to verify, control observations, prioritized analyst research steps, evidence gaps, and analyst questions. Uploaded text is treated as untrusted evidence, and possible malpractice indicators are framed only as leads for human verification, never findings of intent or wrongdoing. The API preserves the deterministic scores, validates referenced evidence IDs, owns the citation list, and never delegates a decision or workflow transition. Actual provider token usage is recorded when returned and aggregated separately from estimates in operations metrics. Unknown, malformed, unavailable, or unsupported model output fails closed with the case remaining in analyst review.

Seed policy entries are synthetic demo artifacts, explicitly labeled as non-authoritative, and excluded from OIDC-mode assessment retrieval. No authoritative production corpus is bundled. Before enabling production assessments, an authorized policy owner must provide and verify each source excerpt; an administrator registers source-linked version 1 records or successor revisions, and a committee member approves each revision. Approval activates the new revision and retires its approved predecessor while preserving audit history. Drafting fails closed if no eligible approved sources match. Production still requires an assigned regulatory owner and an agreed source review, update, approval, and retirement cadence.

## Synthetic evidence ingestion

Product owners can record structured synthetic text evidence or upload a UTF-8 synthetic `.txt` or `.md` document through `POST /api/v1/cases/{case_id}/document-evidence/upload`. Uploads are limited to 20,000 bytes, allow only `text/plain` and `text/markdown`, validate filenames, and receive a server-generated SHA-256 hash before the evidence record and audit event are persisted. PDFs, images, arbitrary binaries, OCR, malware scanning, object storage, and signed-download URLs are deliberately out of scope until the corresponding processing and security services are deployed.

## Repository layout

- `apps/api`: FastAPI service, workflow, scoring and AI adapter boundary.
- `apps/web`: role-aware workbench user interface.
- `docs`: requirements, architecture and governance evidence.
- `evals`: synthetic evaluation datasets and results.
- `ops`: deployment and operational evidence.

## Non-negotiable controls

- Synthetic data only.
- AI prepares evidence and drafts; authorised humans decide.
- Controls can reduce residual risk but cannot eliminate it.
- Each material action must be attributable and auditable.