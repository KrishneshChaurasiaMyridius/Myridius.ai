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

The no-Docker API uses `raw.db`, a SQLite demo database with append-only audit events. It is excluded from source control. Container deployments use PostgreSQL through `DATABASE_URL`.

## Synthetic demo identities

The workbench exposes synthetic identities to demonstrate role-based access control. Product owners create and submit their own cases; analysts assess, draft, override and verify conditions; committee members decide; auditors export evidence; administrators activate a new risk configuration. Production deployment must replace these seeded identities with an enterprise identity provider that supplies equivalent claims.

## Quality gates

GitHub Actions runs the API workflow test suite, Python dependency audit, web type check and high-severity npm audit on pushes and pull requests.

Run the repeatable synthetic end-to-end governance evaluation with `C:\Python313\python.exe evals\run_workflow_evaluation.py`. It verifies deterministic workflow progression, human-only draft authority, citation availability, residual-risk floor enforcement, audit-chain integrity and a denied unauthorized transition.

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