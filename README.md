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

Configure the Auth0 Post Login Action to put `https://myridius.ai/claims/fcrm_role` and `https://myridius.ai/claims/display_name` in both the access token and ID token. The role claim must contain exactly one of `product_owner`, `analyst`, `committee_member`, `auditor`, or `administrator`; the display-name claim should use the user’s assigned workbench name. The workbench reads these ID-token claims for role-gated controls and intake attribution; the API independently validates the access-token claims. On Render set `AUTH_MODE=oidc`, `OIDC_ISSUER` to the Auth0 issuer URL, `OIDC_AUDIENCE` to the same API Identifier, `OIDC_JWKS_URL` to `https://<auth0-domain>/.well-known/jwks.json`, and `OIDC_ROLE_CLAIM=https://myridius.ai/claims/fcrm_role`. Also set `CORS_ALLOWED_ORIGINS` to the exact Vercel origin without a trailing slash. Never put an Auth0 client secret in the browser or repository.

For the current deployment, register `https://myridius-ai-ye2b-one.vercel.app` and `http://localhost:3000` as Auth0 Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins. Deploy and verify the OIDC-enabled frontend before switching the Render API from demo mode; the API will reject demo headers once OIDC mode is active.

## Quality gates

GitHub Actions runs SQLite and PostgreSQL Alembic migration smoke checks, PostgreSQL `CaseStore` initialization, the API workflow test suite, Python dependency audit, web type check, high-severity npm audit, and a Chromium Playwright smoke test that creates a synthetic case through the live workbench on pushes and pull requests.

Run the repeatable synthetic end-to-end governance evaluation with `C:\Python313\python.exe evals\run_workflow_evaluation.py`. It verifies deterministic workflow progression, human-only draft authority, citation availability, persisted AI execution telemetry with estimated token usage, residual-risk floor enforcement, audit-chain integrity and a denied unauthorized transition.

## AI adapter boundary

`AI_ADAPTER=deterministic-mock-v1` is the supported local adapter. Set `AI_ADAPTER=anthropic-claude` only with the deployment-managed `ANTHROPIC_API_KEY`; `ANTHROPIC_MODEL` defaults to `claude-opus-4-8`, while output and request time are bounded by `ANTHROPIC_MAX_TOKENS` (256-4096) and `ANTHROPIC_TIMEOUT_SECONDS` (1-120). The Anthropic adapter accepts only structured JSON containing an analyst-facing summary and questions. The API routes every assessment draft through this provider boundary and persists completed or failed attempts in the execution ledger. An unknown, malformed, or unavailable adapter fails closed with the case remaining in analyst review; it cannot create a decision or advance the workflow.

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