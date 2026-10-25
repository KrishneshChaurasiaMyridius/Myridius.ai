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
- The workbench supports Auth0 authorization-code login with PKCE when `NEXT_PUBLIC_AUTH_MODE=oidc`. Set `NEXT_PUBLIC_AUTH0_DOMAIN`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, `NEXT_PUBLIC_AUTH0_AUDIENCE`, and `NEXT_PUBLIC_API_URL` in Vercel; these are public SPA configuration, not secrets.
- Configure Auth0 callback, logout, and web-origin allowlists for the deployed workbench and local development URL. The Post Login Action must add `https://myridius.ai/claims/fcrm_role` and `https://myridius.ai/claims/display_name` to both ID and access tokens; the role must be one valid application role.
- After deploying and verifying frontend sign-in, set Render `AUTH_MODE=oidc`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`, and `OIDC_ROLE_CLAIM=https://myridius.ai/claims/fcrm_role`. Set `CORS_ALLOWED_ORIGINS` to the exact Vercel origin without a trailing slash. The API validates RS256/ES256 access tokens against JWKS and rejects `X-Actor-Id` in OIDC mode.
- Keep both API `AUTH_MODE=demo` and frontend `NEXT_PUBLIC_AUTH_MODE=demo` for the synthetic local demonstration. Do not switch the API to OIDC until the OIDC-enabled frontend is deployed and Auth0 login is verified.
- Back up the PostgreSQL database before every application or configuration release. Preserve audit-event history; there is intentionally no production deletion endpoint.

## Internet-facing production checklist

1. Provision an HTTPS domain for the workbench and a separate API hostname, or route `/api` through the same HTTPS reverse proxy. Terminate TLS at a managed load balancer or reverse proxy and expose only ports 80/443 publicly; keep PostgreSQL private.
2. Provision managed PostgreSQL 16 with automated backups, point-in-time recovery, encryption at rest, and a private network path from the API. Store its TLS connection string as the `DATABASE_URL` deployment secret.
3. Configure an Auth0 SPA and API. Register the workbench callback/logout/web origins; configure the Post Login Action to add `https://myridius.ai/claims/fcrm_role` and `https://myridius.ai/claims/display_name` to ID and access tokens with exactly one valid application role.
4. Set Vercel `NEXT_PUBLIC_AUTH_MODE=oidc`, `NEXT_PUBLIC_AUTH0_DOMAIN`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, `NEXT_PUBLIC_AUTH0_AUDIENCE`, and `NEXT_PUBLIC_API_URL`. Deploy and verify sign-in before enabling API OIDC.
5. Set Render `AUTH_MODE=oidc`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`, `OIDC_ROLE_CLAIM=https://myridius.ai/claims/fcrm_role`, and exact `CORS_ALLOWED_ORIGINS`; set `AI_ADAPTER` only to a reviewed provider implementation. Use a secret manager for provider credentials when an external adapter is introduced.
6. Build immutable API and web container images, push them to a private registry, deploy them with the production environment variables, and run Alembic once as a controlled release step. The API container also runs migrations at startup for this Compose deployment; use a one-off migration job in multi-replica production.
7. Configure the platform health check to call `GET /ready` and liveness to call `GET /health`. `/ready` verifies database access and complete OIDC configuration without exposing secrets.
8. Before opening public traffic, verify an OIDC login for each role, run the end-to-end workflow evaluator and the Playwright browser workflow in a non-production synthetic environment, verify evidence export and audit integrity, and configure alerting on `/ready` failures, non-zero audit-chain failures, and elevated failed AI executions.

## Incident response

- API unavailable: check `/health`, database connectivity, then container logs.
- Audit failure: stop evidence exports and preserve the affected database snapshot.
- Unauthorized action: capture the `X-Request-Id`, actor, case ID, endpoint and timestamp from logs; review the identity-provider claim mapping in production.
