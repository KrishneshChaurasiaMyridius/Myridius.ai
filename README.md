# Risk Assessment Workbench

A synthetic-data-only Financial Crimes Risk Management (FCRM) workbench for assessing new products and material changes.

## MVP

The first end-to-end slice supports a synthetic change request from product-owner intake through an analyst review and a human committee decision. AI assistance is represented by a deterministic adapter so that results are reproducible and never decide an outcome.

## Local development

1. Copy `.env.example` to `.env` when configuration is added.
2. Run `docker compose up --build` when Docker Desktop is available.
3. The API is available at `http://localhost:8000/health` and API documentation at `http://localhost:8000/docs`.

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