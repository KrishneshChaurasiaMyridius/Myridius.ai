# Operations Runbook

## Service health

- `GET /health` confirms that the API process is accepting requests.
- `GET /api/v1/operations/metrics` requires an auditor or administrator actor. It reports case distribution, audit-event volume, hash-chain failures, active risk configuration and approved policy-source count.
- Every API response includes `X-Request-Id`. Supply that header when calling the API or capture the generated value from the response, then use it to locate the JSON request-completion event in service logs.
- `GET /api/v1/cases/{case_id}/document-evidence/{document_id}/integrity` verifies a stored evidence record's server-generated SHA-256 fingerprint and byte count. A false result is a stop-the-line evidence-integrity incident.
- New policy sources are registered by an administrator and require committee approval through `POST /api/v1/policy-sources/{source_id}/approve` before they can be retrieved for draft citations.
- A non-zero `invalid_audit_chain_count` is a stop-the-line condition: preserve the database, prevent further evidence exports and escalate to the risk-control owner.

## Local demonstration

1. Start the API from `apps/api` with `C:\Python313\python.exe -m uvicorn app.main:app --port 8000`.
2. Start the workbench from `apps/web` with `npm.cmd run dev`.
3. Use the identity selector to demonstrate separation of duties.
4. Run `C:\Python313\python.exe evals\run_workflow_evaluation.py` from the repository root for a repeatable synthetic control check.
5. With the API and workbench running, run `npm.cmd run test:e2e` from `apps/web` for the browser smoke test. In this local environment, use `PLAYWRIGHT_BROWSER_CHANNEL=msedge` when Playwright's managed Chromium cannot be downloaded because of trusted-network certificate interception.

## Container deployment

- Set `DATABASE_URL` to a PostgreSQL connection string; the API selects PostgreSQL when it is present.
- CI starts a disposable PostgreSQL 16 service, applies the complete Alembic chain, and initializes `CaseStore` against it. Treat a failure in that check as a deployment blocker.
- Use a unique secret database password outside source control.
- Set `AUTH_MODE=oidc`, `OIDC_ISSUER`, `OIDC_AUDIENCE` and `OIDC_JWKS_URL` before a production deployment. The API validates RS256/ES256 bearer tokens against the configured JWKS and maps `OIDC_ROLE_CLAIM` (default `fcrm_role`) to the application roles. OIDC mode rejects `X-Actor-Id` demo headers.
- Keep `AUTH_MODE=demo` only for the synthetic local demonstration. The workbench actor selector is demo-only and must be replaced with an enterprise sign-in experience before production release.
- Back up the PostgreSQL database before every application or configuration release. Preserve audit-event history; there is intentionally no production deletion endpoint.

## Internet-facing production checklist

1. Provision an HTTPS domain for the workbench and a separate API hostname, or route `/api` through the same HTTPS reverse proxy. Terminate TLS at a managed load balancer or reverse proxy and expose only ports 80/443 publicly; keep PostgreSQL private.
2. Provision managed PostgreSQL 16 with automated backups, point-in-time recovery, encryption at rest, and a private network path from the API. Store its TLS connection string as the `DATABASE_URL` deployment secret.
3. Create an OIDC application registration. Configure its issuer, audience, JWKS URL, and an `fcrm_role` claim containing exactly `product_owner`, `analyst`, `committee_member`, `auditor`, or `administrator`. Set `AUTH_MODE=oidc`; do not expose the demo actor selector in the production frontend.
4. Set `CORS_ALLOWED_ORIGINS` to the exact public HTTPS workbench origin, set `NEXT_PUBLIC_API_URL` to the public API URL, and set `AI_ADAPTER` only to a reviewed provider implementation. Use a secret manager for provider credentials when an external adapter is introduced.
5. Build immutable API and web container images, push them to a private registry, deploy them with the production environment variables, and run Alembic once as a controlled release step. The API container also runs migrations at startup for this Compose deployment; use a one-off migration job in multi-replica production.
6. Configure the platform health check to call `GET /ready` and liveness to call `GET /health`. `/ready` verifies database access and complete OIDC configuration without exposing secrets.
7. Before opening public traffic, verify an OIDC login for each role, run the end-to-end workflow evaluator and the Playwright browser workflow in a non-production synthetic environment, verify evidence export and audit integrity, and configure alerting on `/ready` failures, non-zero audit-chain failures, and elevated failed AI executions.

## Incident response

- API unavailable: check `/health`, database connectivity, then container logs.
- Audit failure: stop evidence exports and preserve the affected database snapshot.
- Unauthorized action: capture the `X-Request-Id`, actor, case ID, endpoint and timestamp from logs; review the identity-provider claim mapping in production.
